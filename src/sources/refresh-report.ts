import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { privateCacheDir } from "./_shared/cache-path";

// The "Refresh source caches" workflow's PR body section: which sources
// failed this run (passed as arguments by the workflow) and which caches are
// older than `STALE_DAYS`, from each cache's `.meta.json` `fetchedAt`. The
// failures used to show only as workflow warnings, so nobody saw a source
// fail week after week. Source ids and dates only: never a cache's content,
// since this repository's PRs and run logs are public.

const PUBLIC_CACHE_DIR = fileURLToPath(new URL("./cache/", import.meta.url));
export const STALE_DAYS = 14;

/** `[source, fetchedAt]` for every `.meta.json` in `dirs` that has a date. */
export function readFetchDates(dirs: string[]): [string, string][] {
  return dirs
    .filter((dir) => existsSync(dir))
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((file) => file.endsWith(".meta.json"))
        .flatMap((file): [string, string][] => {
          const meta = JSON.parse(readFileSync(join(dir, file), "utf8")) as { fetchedAt?: string };
          return meta.fetchedAt ? [[file.replace(/\.meta\.json$/, ""), meta.fetchedAt]] : [];
        }),
    );
}

/** The report's Markdown: failed sources, then caches older than `staleDays`, oldest first. Pure. */
export function refreshReport(
  failed: string[],
  fetchDates: [string, string][],
  now: Date,
  staleDays = STALE_DAYS,
): string {
  const lines: string[] = [];
  if (failed.length > 0) {
    lines.push(
      `### Failed this run (${failed.length})`,
      "",
      "Left at their last good cache; see the run log for the error.",
      "",
      ...failed.map((source) => `- \`${source}\``),
      "",
    );
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const stale = fetchDates
    .map(([source, fetchedAt]) => ({
      source,
      fetchedAt,
      days: Math.floor((now.getTime() - Date.parse(fetchedAt)) / dayMs),
    }))
    .filter(({ days }) => days > staleDays)
    .toSorted((a, b) => b.days - a.days);
  if (stale.length > 0) {
    lines.push(
      `### Caches older than ${staleDays} days (${stale.length})`,
      "",
      ...stale.map(
        ({ source, fetchedAt, days }) =>
          `- \`${source}\`: ${days} days (fetched ${fetchedAt.slice(0, 10)})`,
      ),
      "",
    );
  }
  return lines.length > 0
    ? lines.join("\n")
    : "Every source refreshed, and no cache is older than two weeks.\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failed = process.argv.slice(2).filter(Boolean);
  const dates = readFetchDates([PUBLIC_CACHE_DIR, privateCacheDir()]);
  process.stdout.write(refreshReport(failed, dates, new Date()));
}
