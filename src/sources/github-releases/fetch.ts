import { parallel } from "helpers4/promise";
import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { GithubReleasesCacheEntry, GithubReleasesFetchMetadata } from "./types";

// Scoped (2026-08-24) via the "GitHub Releases connector" card on the
// Tuxery GitHub Project: no catalog of "Linux desktop apps on GitHub"
// exists, so this discovers candidates via GitHub's own topic search
// rather than attempting exhaustive crawling — 1,240 repos tagged
// `linux-app` at scoping time (GitHub's search API caps actual
// pagination at 1,000), spot-checked as mostly real desktop apps. A real
// tagged Release is the quality gate on top: necessary (nothing to
// install otherwise) but not sufficient on its own — some repos with the
// topic and a Release are packaging tooling, not apps a user would
// launch (AppImageKit itself, found during scoping). Left to the same
// filter/filter-exclude.json pipeline every other source already goes
// through, not a bespoke precision filter here — same "ingest broadly,
// let the shared curator pipeline sort it out" pattern as every other
// connector.
const SEARCH_URL = "https://api.github.com/search/repositories";
const PER_PAGE = 100;
// GitHub's search API hard-caps actual results at 1,000 regardless of
// `total_count` — stop paginating once reached rather than requesting a
// page guaranteed to 422.
const MAX_RESULTS = 1000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// GitHub's search endpoint has its own, much stricter rate limit (30
// req/min authenticated) than the core API (5,000/hr) — 10 pages for
// 1,000 results stays comfortably under it either way.
const LOOKUP_CONCURRENCY = 20;

// The `topic:linux-app` search alone was silently truncating real results:
// verified live 2026-09-04, `total_count` is 1,278 against the connector's
// then-hard 1,000-result cap — 278 real repos permanently unreachable.
// GitHub has no offset-based pagination past 1,000 for any single query,
// but a query scoped with `created:<from>..<to>` reports its own
// `total_count`, so a range that itself exceeds 1,000 can be bisected on
// creation date into two ranges, each independently re-queried — same
// "adaptive deepening to route around a hard result cap" shape as
// Snapcraft's `sweepQueriesRecursively`, bisecting a date range instead of
// a query-string prefix. `MAX_BISECTION_DEPTH` is a circuit breaker (2^6
// = 64 leaf ranges), not an expected ceiling — real growth from 1,278
// repos needs at most one or two splits for a long while yet.
const MAX_BISECTION_DEPTH = 6;
// GitHub itself launched 2008-04-10; any date safely before that works as
// a lower bound. `created:` is inclusive on both ends, so bisected ranges
// must be adjacent, non-overlapping days (see `nextDate` below).
const EARLIEST_POSSIBLE_REPO_DATE = "2007-01-01";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

interface RawRepo {
  name?: string;
  full_name?: string;
  description?: string | null;
  html_url?: string;
  stargazers_count?: number;
  archived?: boolean;
}

interface RawSearchResponse {
  items?: RawRepo[];
  total_count?: number;
}

export interface RawRelease {
  tag_name?: string;
  html_url?: string;
}

export interface SearchPage {
  items: RawRepo[];
  totalCount: number;
}

async function fetchSearchPage(from: string, to: string, page: number): Promise<SearchPage> {
  const q = `topic:linux-app archived:false created:${from}..${to}`;
  const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`;
  const response = await fetchOrThrow(url, "GitHub topic search", { headers: authHeaders() });
  const body = (await response.json()) as RawSearchResponse;
  return { items: body.items ?? [], totalCount: body.total_count ?? 0 };
}

/** The day exactly halfway between `from` and `to` (both `YYYY-MM-DD`), rounding down. Pure. */
export function midDate(from: string, to: string): string {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  return new Date(fromMs + Math.floor((toMs - fromMs) / 2)).toISOString().slice(0, 10);
}

/** The day immediately after `date` (`YYYY-MM-DD`) — keeps bisected ranges adjacent and non-overlapping, since `created:` is inclusive on both ends. Pure. */
export function nextDate(date: string): string {
  return new Date(Date.parse(date) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Pages through one `created:<from>..<to>` range, `PER_PAGE` at a time,
 * up to `MAX_RESULTS` — GitHub's search API rejects a page beyond what
 * its 1,000-result cap allows with a 422, so this stops requesting once
 * that cap is reached rather than looping until an empty page. Assumes
 * the range's own `total_count` already fits under `MAX_RESULTS` —
 * `searchDateRange` below is what decides that.
 */
async function paginateRange(
  from: string,
  to: string,
  firstPage: SearchPage,
  fetchPage: (from: string, to: string, page: number) => Promise<SearchPage>,
): Promise<RawRepo[]> {
  const repos = [...firstPage.items];

  for (let page = 2; repos.length < firstPage.totalCount && repos.length < MAX_RESULTS; page++) {
    // eslint-disable-next-line no-await-in-loop
    const next = await fetchPage(from, to, page);
    if (next.items.length === 0) break;
    repos.push(...next.items);
    if (next.items.length < PER_PAGE) break;
  }

  return repos.slice(0, MAX_RESULTS);
}

/**
 * Searches one `created:<from>..<to>` date range for the `linux-app`
 * topic, recursively bisecting it on creation date whenever its own
 * `total_count` exceeds `MAX_RESULTS` — see this file's header comment
 * on why a single unbounded query silently truncates. `depth` bounds the
 * recursion (`MAX_BISECTION_DEPTH`, a circuit breaker) rather than
 * splitting forever against a pathological response. Sequential, not
 * parallel, across the two bisected halves — deliberately conservative
 * against the search endpoint's own stricter (30 req/min) rate limit,
 * since real-world depth is shallow (one or two splits) and this isn't
 * the connector's time-critical half anyway (per-repo Release lookups
 * dominate runtime). Pure aside from the injected `fetchPage` call, so
 * the bisection logic itself is testable without a real network
 * dependency.
 */
export async function searchDateRange(
  from: string,
  to: string,
  fetchPage: (from: string, to: string, page: number) => Promise<SearchPage>,
  depth = 0,
): Promise<RawRepo[]> {
  const firstPage = await fetchPage(from, to, 1);

  if (firstPage.totalCount <= MAX_RESULTS || depth >= MAX_BISECTION_DEPTH || from === to) {
    return paginateRange(from, to, firstPage, fetchPage);
  }

  const mid = midDate(from, to);
  const left = await searchDateRange(from, mid, fetchPage, depth + 1);
  const right = await searchDateRange(nextDate(mid), to, fetchPage, depth + 1);
  return [...left, ...right];
}

async function searchRepos(): Promise<RawRepo[]> {
  const today = new Date().toISOString().slice(0, 10);
  return searchDateRange(EARLIEST_POSSIBLE_REPO_DATE, today, fetchSearchPage);
}

/**
 * One repo's latest Release, when it has one — `undefined` for a repo
 * with no Release at all (continuous-build-only, or a shell-installer
 * project like winapps — see this connector's scoping notes) or on any
 * non-2xx response, not just a 404: an ambiguous failure should drop
 * this one repo, not crash the whole fetch.
 */
async function lookupLatestRelease(repo: string): Promise<RawRelease | undefined> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: authHeaders(),
  });
  if (!response.ok) return undefined;
  return (await response.json()) as RawRelease;
}

/**
 * Resolves every repo's latest Release, `concurrency` at a time — same
 * bounded-worker-pool shape as `appimage/fetch.ts`'s `resolveEntries`
 * (a plain `Promise.all` over up to 1,000 repos would fire every request
 * at once). Drops repos with no Release.
 */
export async function resolveEntries(
  repos: RawRepo[],
  lookup: (repo: string) => Promise<RawRelease | undefined>,
  concurrency: number,
): Promise<GithubReleasesCacheEntry[]> {
  const results = await parallel(
    repos.map((repo) => async (): Promise<GithubReleasesCacheEntry | undefined> => {
      if (!repo.full_name || !repo.name) return undefined;
      const release = await lookup(repo.full_name);
      if (!release?.tag_name) return undefined;
      return {
        name: repo.name,
        description: repo.description ?? "",
        repo: repo.full_name,
        version: release.tag_name,
        homepage: repo.html_url ?? `https://github.com/${repo.full_name}`,
        releaseUrl: release.html_url ?? `https://github.com/${repo.full_name}/releases/latest`,
        stars: repo.stargazers_count ?? 0,
      };
    }),
    concurrency,
  );
  return results.filter((entry) => entry !== undefined);
}

/**
 * Searches GitHub for repos tagged `linux-app`, resolves each one's
 * latest Release, and writes the ones that have one to `cachePath` as
 * NDJSON. See the module header comment and docs/sources.md for the
 * full scoping.
 */
export async function fetchGithubReleases(cachePath: string): Promise<number> {
  const repos = await searchRepos();
  const entries = await resolveEntries(repos, lookupLatestRelease, LOOKUP_CONCURRENCY);

  writeNdjson(cachePath, entries);
  writeMetadata<GithubReleasesFetchMetadata>(cachePath, {
    source: "github-releases",
    fetchedAt: new Date().toISOString(),
    url: SEARCH_URL,
    entryCount: entries.length,
    totalSearchResults: repos.length,
  });

  return entries.length;
}
