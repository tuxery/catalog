import { join } from "node:path";
import { writeMetadata } from "../_shared/metadata";
import { readNdjson, writeNdjson } from "../_shared/ndjson";
import type { ManualAppImageCacheEntry, ManualAppImageFetchMetadata } from "./types";

// Hand-maintained, source-controlled seed file — not fetched from any
// network endpoint (there's nothing to fetch: these are apps with no
// GitHub repo, so the `appimage` connector's feed+Releases-lookup
// mechanism doesn't apply, and no other source carries them either).
// See docs/sources.md for the "would a user launch this on its own"
// bar new entries need to clear.
const SEED_PATH = join(import.meta.dirname, "manual-appimages.ndjson");

// Deliberately records `homepage` (where a user goes to get the app), not
// a raw AppImage download URL — matching the `appimage` connector's own
// precedent (its `homepage` is the GitHub repo page, not a direct binary
// link; the install CTA always sends the user to a page, never attempts
// a one-click file fetch). Investigated going further for the motivating
// pCloud case: its real download link is resolved via a live call to
// `api.pcloud.com/getpublinkdownload?code=<fixed-code>` (confirmed
// working, verified live) rather than a static URL — the API response's
// `expires` field is only hours out, so even a "resolve once, cache the
// result" approach would go stale between weekly refreshes. Not worth
// the added fetch-time complexity (and the trust question of embedding
// pCloud's public-link code) when linking to their own install page
// already matches how every other AppImage entry behaves.
export function loadSeed(): ManualAppImageCacheEntry[] {
  return readNdjson<ManualAppImageCacheEntry>(SEED_PATH);
}

/** Drops any hand-edited entry missing a required field before it reaches the cache. Pure — no I/O. */
export function validateEntries(entries: ManualAppImageCacheEntry[]): ManualAppImageCacheEntry[] {
  return entries.filter((entry) => entry.name && entry.description !== undefined && entry.homepage);
}

/**
 * Validates the hand-written seed file and writes it to `cachePath` as
 * NDJSON — same cache/metadata shape as every other source, so it flows
 * through `refresh.ts`/the pipeline identically, even though there's no
 * actual network fetch here. No real version concept for a source with
 * no release feed at all — same "unknown" precedent as GOG/Lutris.
 */
export async function fetchManualAppImages(cachePath: string): Promise<number> {
  const entries = validateEntries(loadSeed());

  writeNdjson(cachePath, entries);
  writeMetadata<ManualAppImageFetchMetadata>(cachePath, {
    source: "appimage-manual",
    fetchedAt: new Date().toISOString(),
    url: SEED_PATH,
    entryCount: entries.length,
  });

  return entries.length;
}
