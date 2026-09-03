import type { FetchMetadata } from "../_shared/metadata";

/**
 * One entry from the AUR's `packages-meta-ext-v1.json.gz` metadata dump,
 * the shape cached after fetching. Deliberately close to the upstream
 * fields rather than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface AurCacheEntry {
  name: string;
  description: string;
  version: string;
  homepage?: string;
  /**
   * Packager-submitted free-form tags from the dump's `Keywords` field
   * (e.g. `["game", "wine"]`) — free-form, not a controlled vocabulary,
   * but packager-authored positive labels for the package's own domain.
   * Cached verbatim (whitespace-only tags dropped); any interpretation
   * lives in the curator module, not here.
   */
  keywords?: string[];
  /** SPDX-ish license strings from the dump's `License` field, AND-joined (e.g. "GPL3 AND MIT"). */
  license?: string;
  /** See `SourcedPackage.popularity`. */
  popularity?: number;
}

export type AurFetchMetadata = FetchMetadata;
