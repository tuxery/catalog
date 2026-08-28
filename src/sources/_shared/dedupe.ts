/**
 * Deduplicates items by a derived key, later items overwriting earlier ones
 * on a collision — the "merge multiple repo sweeps, last one wins" Map-
 * building loop that Fedora/RPM Fusion's release+updates repos and
 * Snapcraft's category+query-char sweeps were each hand-rolling
 * identically. Pass an already-flattened array (`repoEntries.flat()`) when
 * merging several repos in priority order, since later array entries win.
 */
export function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) byKey.set(keyFn(item), item);
  return [...byKey.values()];
}
