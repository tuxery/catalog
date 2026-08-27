import { fileURLToPath } from "node:url";
import type { SourcedPackage } from "../types";
import { readNdjson } from "./ndjson";

/**
 * Builds a source's `searchX(query)` function — for every source, the
 * entire "search" is reading the git-committed NDJSON cache and
 * normalizing it (`query` itself is unused; kept as a parameter so every
 * `searchX` has the same shape, see `search.ts`'s `searchAllSources`).
 * Was previously ~17 lines of identical boilerplate hand-copied into
 * each source's own `index.ts`; this is the one place it's implemented.
 *
 * Resolves the cache path relative to *this* module's own location
 * (`_shared/`), not the caller's — safe because `_shared/` sits at the
 * same depth under `sources/` as every per-source folder, so
 * `../cache/<name>.ndjson` lands in the identical place (`src/sources/
 * cache/`) no matter which one computes it.
 */
export function makeCacheSearch<T>(
  cacheName: string,
  normalize: (entries: T[]) => SourcedPackage[],
): (query: string) => Promise<SourcedPackage[]> {
  const cachePath = fileURLToPath(new URL(`../cache/${cacheName}.ndjson`, import.meta.url));

  return async function search(query: string): Promise<SourcedPackage[]> {
    void query;
    return normalize(readNdjson<T>(cachePath));
  };
}
