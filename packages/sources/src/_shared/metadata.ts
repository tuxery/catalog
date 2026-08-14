import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Common fields every source's fetch metadata has — each source extends
 * this with whatever else is relevant (e.g. Flathub's `arch`, Snapcraft's
 * `deviceSeries`), same "not a single shared schema" philosophy as cache
 * row types.
 */
export interface FetchMetadata {
  source: string;
  /** ISO timestamp of when this fetch ran. */
  fetchedAt: string;
  /** Upstream URL/endpoint this data came from. */
  url: string;
  entryCount: number;
}

/**
 * `cache/flathub.ndjson` -> `cache/flathub.meta.json`. A sibling file
 * rather than a header row in the NDJSON itself, so re-fetching (which
 * always changes `fetchedAt`) doesn't touch every data line's diff.
 */
export function metadataPathFor(cachePath: string): string {
  return cachePath.replace(/\.ndjson$/, ".meta.json");
}

export function writeMetadata<T extends FetchMetadata>(cachePath: string, metadata: T): void {
  writeFileSync(metadataPathFor(cachePath), `${JSON.stringify(metadata, null, 2)}\n`);
}

export function readMetadata<T extends FetchMetadata = FetchMetadata>(
  cachePath: string,
): T | undefined {
  const path = metadataPathFor(cachePath);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
