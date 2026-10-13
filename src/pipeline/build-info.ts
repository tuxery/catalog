import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * What the site shows in its footer about where the data comes from, three
 * questions with three answers (never a hand-bumped version number: nobody
 * installs this repo, and a number someone has to remember to change stays
 * at 0.1.0 forever):
 * - `catalog`: which code built the dataset, the commit and its commit date
 *   (not the build date: two builds of one commit are the same version);
 * - `sources`: how old the data is, the oldest and newest `fetchedAt` among
 *   the source caches. `Dataset.generatedAt` isn't that: it is when the
 *   dataset was built, from caches that may be a week old.
 *
 * Each part is absent when it can't be read (no git checkout, no cache
 * metadata), never guessed.
 */
export interface BuildInfo {
  catalog?: { commit: string; date: string };
  sources?: { oldest: string; newest: string };
}

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CACHE_DIR = fileURLToPath(new URL("../sources/cache", import.meta.url));

/** The checkout's HEAD: short SHA and commit date as a UTC ISO string. */
export function readCatalogCommit(cwd = REPO_ROOT): BuildInfo["catalog"] {
  try {
    const [commit, date] = execFileSync("git", ["log", "-1", "--format=%h%n%cI"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split("\n");
    if (!commit || !date) return undefined;
    return { commit, date: new Date(date).toISOString() };
  } catch {
    return undefined;
  }
}

/** The oldest and newest `fetchedAt` among the `*.meta.json` files of `dir`. */
export function readSourcesRange(dir = CACHE_DIR): BuildInfo["sources"] {
  const dates: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".meta.json")) continue;
    const { fetchedAt } = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as {
      fetchedAt?: unknown;
    };
    if (typeof fetchedAt === "string" && !Number.isNaN(Date.parse(fetchedAt))) {
      dates.push(new Date(fetchedAt).toISOString());
    }
  }
  const sorted = dates.toSorted();
  const [oldest, newest] = [sorted.at(0), sorted.at(-1)];
  return oldest && newest ? { oldest, newest } : undefined;
}

export function readBuildInfo(): BuildInfo {
  return { catalog: readCatalogCommit(), sources: readSourcesRange() };
}
