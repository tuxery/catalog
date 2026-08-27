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
}

export interface RawRelease {
  tag_name?: string;
  html_url?: string;
}

/**
 * Pages through the topic search, `PER_PAGE` at a time, up to
 * `MAX_RESULTS` — GitHub's search API rejects a page beyond what its
 * 1,000-result cap allows with a 422, so this stops requesting once that
 * cap is reached rather than looping until an empty page.
 */
async function searchRepos(): Promise<RawRepo[]> {
  const repos: RawRepo[] = [];

  for (let page = 1; repos.length < MAX_RESULTS; page++) {
    const url = `${SEARCH_URL}?q=${encodeURIComponent("topic:linux-app archived:false")}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`;
    // eslint-disable-next-line no-await-in-loop
    const response = await fetchOrThrow(url, "GitHub topic search", { headers: authHeaders() });
    // eslint-disable-next-line no-await-in-loop
    const body = (await response.json()) as RawSearchResponse;
    const items = body.items ?? [];
    if (items.length === 0) break;
    repos.push(...items);
    if (items.length < PER_PAGE) break;
  }

  return repos.slice(0, MAX_RESULTS);
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
  const results: (GithubReleasesCacheEntry | undefined)[] = Array.from({ length: repos.length });
  let next = 0;

  async function worker() {
    while (next < results.length) {
      const index = next++;
      const repo = repos[index];
      if (!repo?.full_name || !repo.name) continue;
      // Sequential *within* one worker is the point — parallelism comes
      // from running `concurrency` workers at once (see Promise.all
      // below), not from awaiting everything simultaneously.
      // eslint-disable-next-line no-await-in-loop
      const release = await lookup(repo.full_name);
      if (!release?.tag_name) continue;
      results[index] = {
        name: repo.name,
        description: repo.description ?? "",
        repo: repo.full_name,
        version: release.tag_name,
        homepage: repo.html_url ?? `https://github.com/${repo.full_name}`,
        releaseUrl: release.html_url ?? `https://github.com/${repo.full_name}/releases/latest`,
        stars: repo.stargazers_count ?? 0,
      };
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, results.length) }, worker));
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
