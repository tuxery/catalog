import type { FetchMetadata } from "../_shared/metadata";

/**
 * One hand-curated entry from `manual-appimages.ndjson` (source-controlled,
 * next to this connector — not fetched from any network endpoint), the
 * shape cached after validating. For software distributed only as a
 * direct AppImage download with no GitHub repo (so the `appimage`
 * connector's GitHub-Releases-lookup mechanism doesn't apply) and not
 * covered by any other source — see fetch.ts for why this only records a
 * `homepage` rather than attempting a raw download URL.
 */
export interface ManualAppImageCacheEntry {
  name: string;
  description: string;
  homepage: string;
}

export type ManualAppImageFetchMetadata = FetchMetadata;
