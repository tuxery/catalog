import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readNdjson, writeNdjson } from "../_shared/ndjson";
import { postQuery, queryBatch, RateLimitedError, type PostQuery } from "./fetch";

/**
 * A GitHub repository's own description and topics: what its owner says
 * the project is. Owner-written text, so unlike the star counts it is
 * never committed to this public repository (GitHub's terms license it
 * to other users for use on GitHub, not for a copy elsewhere): it is
 * fetched on demand for `classify-llm --github-about` into a gitignored
 * local file, and only the resulting verdicts, in the model's own few
 * words, are committed (`config/llm-classifications.json`).
 */
export interface GithubAbout {
  /** `owner/repo`, lowercased, as the stars cache and `CatalogApp.githubStars` spell it. */
  repo: string;
  description?: string;
  topics?: string[];
}

/** Where `classify-llm --github-about` keeps what it fetched: gitignored (`.cache/`), never published. */
export const GITHUB_ABOUT_PATH = fileURLToPath(
  new URL("../../../.cache/github-about.ndjson", import.meta.url),
);

const BATCH_SIZE = 100;
// Topics past the first ten add little: owners list the main ones first.
const ABOUT_SELECTION = "description repositoryTopics(first: 10) { nodes { topic { name } } }";

interface AboutNode {
  description?: string | null;
  repositoryTopics?: { nodes?: ({ topic?: { name?: string } } | null)[] } | null;
}

/** The row for one repository GitHub answered for, empty fields left out. Pure. */
export function toAbout(repo: string, node: AboutNode | undefined): GithubAbout {
  const description = node?.description?.replaceAll(/\s+/g, " ").trim();
  const topics = (node?.repositoryTopics?.nodes ?? []).flatMap((entry) =>
    entry?.topic?.name ? [entry.topic.name] : [],
  );
  return {
    repo,
    ...(description ? { description } : {}),
    ...(topics.length > 0 ? { topics } : {}),
  };
}

/**
 * Asks GitHub's GraphQL API for the description and topics of `repos`,
 * 100 per query, one query at a time. A repository GitHub doesn't serve
 * (deleted, private) gets an empty row, so it isn't asked again; one it
 * failed to answer gets none. Stops early, keeping what it has, when
 * GitHub keeps refusing for its rate limits.
 */
export async function fetchGithubAbout(
  repos: readonly string[],
  post: PostQuery = postQuery,
  wait?: (ms: number) => Promise<unknown>,
): Promise<GithubAbout[]> {
  const rows: GithubAbout[] = [];
  for (let index = 0; index < repos.length; index += BATCH_SIZE) {
    const batch = repos.slice(index, index + BATCH_SIZE);
    try {
      // One query at a time: GitHub asks for serial requests (see fetch.ts).
      // eslint-disable-next-line no-await-in-loop
      const result = await queryBatch<AboutNode>(batch, post, wait, 0, ABOUT_SELECTION);
      for (const repo of batch) {
        if (result.found.has(repo)) rows.push(toAbout(repo, result.found.get(repo)));
      }
      for (const repo of result.missing) rows.push({ repo });
    } catch (error) {
      if (!(error instanceof RateLimitedError)) throw error;
      console.warn(`github-about: ${error.message}; stopping with ${rows.length} repositories.`);
      break;
    }
  }
  return rows;
}

/** The fetched descriptions and topics, keyed by repository (empty when nothing was fetched yet). */
export function readGithubAbout(path: string = GITHUB_ABOUT_PATH): Map<string, GithubAbout> {
  return new Map(readNdjson<GithubAbout>(path).map((row) => [row.repo, row]));
}

/** Writes `rows`, sorted by repository, to the local file. */
export function writeGithubAbout(
  rows: Iterable<GithubAbout>,
  path: string = GITHUB_ABOUT_PATH,
): void {
  const sorted = [...rows].toSorted((a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0));
  mkdirSync(dirname(path), { recursive: true });
  writeNdjson(path, sorted);
}
