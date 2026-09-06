import { uniqueBy } from "helpers4/array";

/**
 * Deduplicates items by a derived key, later items overwriting earlier ones
 * on a collision — the "merge multiple repo sweeps, last one wins" pattern
 * that Fedora/RPM Fusion's release+updates repos and Snapcraft's
 * category+query-char sweeps each need identically. Pass an
 * already-flattened array (`repoEntries.flat()`) when merging several repos
 * in priority order, since later array entries win.
 */
export function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  return uniqueBy(items, keyFn, { keep: "last" });
}
