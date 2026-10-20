import type { SourcedPackage } from "../types";
import { cachePathFor } from "./cache-path";
import { readNdjson } from "./ndjson";

/**
 * Builds a source's `searchX(query)` function — for every source, the
 * entire "search" is reading the git-committed NDJSON cache and
 * normalizing it (`query` itself is unused; kept as a parameter so every
 * `searchX` has the same shape, see `search.ts`'s `searchAllSources`).
 * Was previously ~17 lines of identical boilerplate hand-copied into
 * each source's own `index.ts`; this is the one place it's implemented.
 *
 * The cache is `src/sources/cache/<name>.ndjson`, or the private one for a
 * restricted source (`./cache-path.ts`), read as empty when it isn't there.
 */
export function makeCacheSearch<T>(
  cacheName: string,
  normalize: (entries: T[]) => SourcedPackage[],
): (query: string) => Promise<SourcedPackage[]> {
  const cachePath = cachePathFor(cacheName);

  return async function search(query: string): Promise<SourcedPackage[]> {
    void query;
    return normalize(readNdjson<T>(cachePath));
  };
}
