import { setTimeout as sleep } from "node:timers/promises";
import { parallel } from "helpers4/promise";
import { cachePathFor } from "../_shared/cache-path";
import { withUserAgent } from "../_shared/http";
import { readMetadata, writeMetadata } from "../_shared/metadata";
import { readNdjson, writeNdjson } from "../_shared/ndjson";
import { searchAllSources } from "../search";
import { packageGithubRepos } from "./repo-url";
import type { GithubStarsCacheEntry, GithubStarsFetchMetadata } from "./types";

// GitHub's GraphQL API answers for up to 100 repositories in one query
// (one aliased `repository(...)` field each), and such a query costs 1
// point of the hourly budget: ~550 points for the ~55,000 repositories the
// other sources point to. Through REST that would be one request per
// repository, ten times the 5,000 an hour a token gets.
const GRAPHQL_URL = "https://api.github.com/graphql";
const BATCH_SIZE = 100;
// Two queries at once: GitHub asks for serial requests to stay clear of
// its secondary rate limits (four at once hit them within a minute), but
// one 100-repository query takes ~4 s.
const CONCURRENCY = 2;
// Points left unspent for anything else using the same token (the
// GitHub Releases and AppImage lookups use REST, a separate budget). CI's
// GITHUB_TOKEN has 1,000 GraphQL points an hour, a personal token 5,000.
const RATE_LIMIT_RESERVE = 50;
// GitHub's secondary limit on GraphQL server time holds a token to about
// 30 such queries a minute (measured 2026-11-16, 4 at a time): asking for
// all ~100,000 repositories would take most of an hour. Each run asks for
// the new repositories, then this many queries' worth of known ones from
// where the previous run stopped: every repository about every two weeks
// and a half, ~14 minutes a week. Stars move slowly; a percentile slower.
const MAX_QUERIES_PER_RUN = 400;
const PROGRESS_EVERY = 50;
// How long to wait on a secondary rate limit without a `Retry-After`
// (GitHub: at least a minute, then longer each time), and how many times
// before the run stops asking.
const SECONDARY_LIMIT_WAIT_MS = 60_000;
const MAX_RATE_LIMITED_RETRIES = 4;

// GITHUB_TOKEN is what CI injects; GH_TOKEN (the devcontainer's gh CLI
// token) is the local fallback. GraphQL refuses anonymous requests.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

interface RepositoryNode {
  nameWithOwner: string;
  stargazerCount: number;
}

/** The repository fields the stars refresh asks for. */
const STARS_SELECTION = "nameWithOwner stargazerCount";

interface GraphqlBody {
  data?: Record<string, unknown> | null;
  errors?: { type?: string; path?: (string | number)[]; message?: string }[];
}

/** One answer of the GraphQL endpoint, reduced to what `queryBatch` needs. */
export interface GraphqlResponse {
  status: number;
  body?: GraphqlBody;
  /** `Retry-After`, in seconds, when GitHub sends one. */
  retryAfter?: number;
  /** The start of an error response's body, for the log. */
  errorText?: string;
}

export type PostQuery = (query: string) => Promise<GraphqlResponse>;

/** What one batch tells: each repository GitHub serves, which it doesn't, and which it failed to answer for. */
export interface BatchResult<Node = RepositoryNode> {
  found: Map<string, Node>;
  missing: string[];
  /** Repositories GitHub kept failing on (gateway errors): they keep their previous row. */
  unanswered: string[];
  /** Points left in the hour, from the query's own `rateLimit`. */
  remaining?: number;
}

/** GitHub kept refusing for its rate limits: the run stops asking, the cache keeps what it has. */
export class RateLimitedError extends Error {
  constructor(status: number, times: number) {
    super(`GitHub GraphQL: rate limited (${status}) ${times} times in a row`);
  }
}

/**
 * One GraphQL query asking for every repository of `repos` (`owner/repo`,
 * as `repo-url.ts` validates them: no character needs escaping beyond
 * what `JSON.stringify` does), aliased `r0`, `r1`... in order, each for
 * the fields of `selection` (the star count by default). Pure.
 */
export function buildQuery(repos: readonly string[], selection: string = STARS_SELECTION): string {
  const fields = repos.map((repo, index) => {
    const [owner = "", name = ""] = repo.split("/");
    return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${selection} }`;
  });
  return `query { rateLimit { remaining } ${fields.join(" ")} }`;
}

// Per-repository errors: the alias reads `null`, the rest of the batch
// is still good.
const REPOSITORY_ERRORS = new Set(["NOT_FOUND", "FORBIDDEN"]);

/**
 * Reads a batch's answer: a repository whose alias came back `null` with a
 * `NOT_FOUND`/`FORBIDDEN` error (deleted, private, blocked) is missing;
 * any other error fails the batch rather than reading as missing, so a
 * broken query never empties the cache. Pure.
 */
export function parseBatch<Node = RepositoryNode>(
  repos: readonly string[],
  body: GraphqlBody | undefined,
): BatchResult<Node> {
  const data = body?.data;
  const otherErrors = (body?.errors ?? []).filter(
    (error) => !REPOSITORY_ERRORS.has(error.type ?? "") || error.path?.length !== 1,
  );
  if (!data || otherErrors.length > 0) {
    const message = otherErrors[0]?.message ?? "no data";
    throw new Error(`GitHub GraphQL: ${message}`);
  }

  const found = new Map<string, Node>();
  const missing: string[] = [];
  repos.forEach((repo, index) => {
    const node = data[`r${index}`] as Node | null | undefined;
    if (node && typeof node === "object") found.set(repo, node);
    else missing.push(repo);
  });
  const rateLimit = data.rateLimit as { remaining?: number } | null | undefined;
  return { found, missing, unanswered: [], remaining: rateLimit?.remaining };
}

/**
 * Asks GitHub about one batch. A gateway error or timeout (a large batch
 * now and then takes GitHub too long) splits the batch in two and asks
 * again, down to a single repository, which then stays unanswered; a
 * secondary rate limit waits and retries, longer each time, then throws
 * `RateLimitedError`. Anything else throws. `selection` is the fields
 * asked for each repository (see `buildQuery`).
 */
export async function queryBatch<Node = RepositoryNode>(
  repos: readonly string[],
  post: PostQuery,
  wait: (ms: number) => Promise<unknown> = sleep,
  attempt = 0,
  selection: string = STARS_SELECTION,
): Promise<BatchResult<Node>> {
  const response = await post(buildQuery(repos, selection));

  if (response.status === 403 || response.status === 429) {
    if (attempt >= MAX_RATE_LIMITED_RETRIES)
      throw new RateLimitedError(response.status, attempt + 1);
    const ms = response.retryAfter
      ? response.retryAfter * 1000
      : SECONDARY_LIMIT_WAIT_MS * 2 ** attempt;
    console.warn(
      `github-stars: rate limited (${response.status} ${response.errorText ?? ""}), waiting ${ms / 1000} s`,
    );
    await wait(ms);
    return queryBatch<Node>(repos, post, wait, attempt + 1, selection);
  }

  if (response.status >= 500) {
    if (repos.length === 1) return { found: new Map(), missing: [], unanswered: [...repos] };
    const half = Math.ceil(repos.length / 2);
    const left = await queryBatch<Node>(repos.slice(0, half), post, wait, 0, selection);
    const right = await queryBatch<Node>(repos.slice(half), post, wait, 0, selection);
    return {
      found: new Map([...left.found, ...right.found]),
      missing: [...left.missing, ...right.missing],
      unanswered: [...left.unanswered, ...right.unanswered],
      remaining: right.remaining ?? left.remaining,
    };
  }

  if (response.status !== 200) throw new Error(`GitHub GraphQL: HTTP ${response.status}`);
  return parseBatch<Node>(repos, response.body);
}

/** Posts one query to GitHub's GraphQL endpoint with the token of the environment. */
export async function postQuery(query: string): Promise<GraphqlResponse> {
  if (!GITHUB_TOKEN) {
    throw new Error("GitHub GraphQL needs a token: set GITHUB_TOKEN (CI) or GH_TOKEN (local).");
  }
  const response = await fetch(
    GRAPHQL_URL,
    withUserAgent({
      method: "POST",
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }),
  );
  const retryAfter = Number(response.headers.get("retry-after")) || undefined;
  if (!response.ok) {
    const errorText = (await response.text()).slice(0, 200);
    return { status: response.status, retryAfter, errorText };
  }
  return { status: response.status, body: (await response.json()) as GraphqlBody, retryAfter };
}

/** The cache row for one repository GitHub answered for. Pure. */
export function toEntry(repo: string, node: RepositoryNode): GithubStarsCacheEntry {
  const canonical = node.nameWithOwner.toLowerCase();
  return canonical === repo
    ? { repo, stars: node.stargazerCount }
    : { repo, stars: node.stargazerCount, canonical };
}

/**
 * The order to ask in: repositories the previous cache doesn't know yet
 * first, then the known ones from `cursor` on (the first one sorting at or
 * after it), wrapping around. Pure.
 */
export function queryOrder(
  repos: readonly string[],
  previous: ReadonlyMap<string, unknown>,
  cursor: string | undefined,
): string[] {
  const fresh = repos.filter((repo) => !previous.has(repo));
  const known = repos.filter((repo) => previous.has(repo)).toSorted();
  const offset = cursor === undefined ? -1 : known.findIndex((repo) => repo >= cursor);
  if (offset <= 0) return [...fresh, ...known];
  return [...fresh, ...known.slice(offset), ...known.slice(0, offset)];
}

export interface CollectResult {
  entries: GithubStarsCacheEntry[];
  queried: number;
  missing: number;
  /** Where the next run picks up: the first known repository this one didn't reach, `undefined` when it reached them all. */
  cursor?: string;
}

/**
 * Asks GitHub for the stars of `repos` in `queryOrder`, `BATCH_SIZE` per
 * query, `CONCURRENCY` queries at a time, at most `maxQueries` queries,
 * and stops early once fewer than `RATE_LIMIT_RESERVE` points are left or
 * GitHub keeps refusing (`RateLimitedError`).
 * The repositories it doesn't reach keep their `previous` row and come
 * first next time (`cursor`). Sorted by `repo`, for small diffs.
 */
export async function collectStars(
  repos: readonly string[],
  previous: ReadonlyMap<string, GithubStarsCacheEntry>,
  post: PostQuery,
  options: { cursor?: string; maxQueries?: number; wait?: (ms: number) => Promise<unknown> } = {},
): Promise<CollectResult> {
  const wait = options.wait ?? sleep;
  const order = queryOrder(repos, previous, options.cursor);
  const batches: string[][] = [];
  const limit = Math.min(order.length, (options.maxQueries ?? Infinity) * BATCH_SIZE);
  for (let index = 0; index < limit; index += BATCH_SIZE) {
    batches.push(order.slice(index, Math.min(index + BATCH_SIZE, limit)));
  }

  const answered = new Map<string, GithubStarsCacheEntry>();
  const queried = new Set<string>();
  let missing = 0;
  let exhausted = false;
  let done = 0;
  await parallel(
    batches.map((batch) => async () => {
      if (exhausted) return;
      let result: BatchResult;
      try {
        result = await queryBatch(batch, post, wait);
      } catch (error) {
        if (!(error instanceof RateLimitedError)) throw error;
        exhausted = true;
        console.warn(
          `github-stars: ${error.message}; keeping the previous stars of the repositories not reached.`,
        );
        return;
      }
      const unanswered = new Set(result.unanswered);
      for (const repo of batch) if (!unanswered.has(repo)) queried.add(repo);
      for (const [repo, node] of result.found) answered.set(repo, toEntry(repo, node));
      missing += result.missing.length;
      if (++done % PROGRESS_EVERY === 0) {
        console.log(`github-stars: ${done}/${batches.length} queries`);
      }
      if (result.remaining !== undefined && result.remaining < RATE_LIMIT_RESERVE) {
        exhausted = true;
        console.warn(
          `github-stars: GraphQL rate limit nearly spent (${result.remaining} points left), keeping the previous stars of the repositories not reached.`,
        );
      }
    }),
    CONCURRENCY,
  );

  const entries = repos.flatMap((repo) => {
    const entry = queried.has(repo) ? answered.get(repo) : previous.get(repo);
    return entry ? [entry] : [];
  });
  entries.sort((a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0));
  const cursor = order.find((repo) => previous.has(repo) && !queried.has(repo));
  return { entries, queried: queried.size, missing, cursor };
}

/** Every GitHub repository any source's package points to, sorted. */
export async function referencedRepos(): Promise<string[]> {
  const packages = await searchAllSources("");
  return [...new Set(packages.flatMap(packageGithubRepos))].toSorted();
}

/**
 * Refreshes the stars of the GitHub repositories `repos` (by default every
 * one the other sources point to) and writes them to `cachePath` as
 * NDJSON: new repositories first, then `MAX_QUERIES_PER_RUN` queries' worth
 * of known ones, from where the previous run stopped (`cursor` in the
 * metadata). Reads the other sources' caches, so the refresh runs it last
 * (see `refreshers.ts`).
 */
export async function fetchGithubStars(
  cachePath: string = cachePathFor("github-stars"),
  repos?: readonly string[],
  maxQueries: number = MAX_QUERIES_PER_RUN,
): Promise<number> {
  const wanted = repos ?? (await referencedRepos());
  const previous = new Map(
    readNdjson<GithubStarsCacheEntry>(cachePath).map((entry) => [entry.repo, entry]),
  );
  const { entries, queried, missing, cursor } = await collectStars(wanted, previous, postQuery, {
    cursor: readMetadata<GithubStarsFetchMetadata>(cachePath)?.cursor,
    maxQueries,
  });

  writeNdjson(cachePath, entries);
  writeMetadata<GithubStarsFetchMetadata>(cachePath, {
    source: "github-stars",
    fetchedAt: new Date().toISOString(),
    url: GRAPHQL_URL,
    entryCount: entries.length,
    repositoriesReferenced: wanted.length,
    repositoriesQueried: queried,
    repositoriesMissing: missing,
    ...(cursor === undefined ? {} : { cursor }),
  });
  return entries.length;
}
