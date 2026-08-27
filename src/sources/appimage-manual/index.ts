import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { ManualAppImageCacheEntry } from "./types";

/**
 * Searches the hand-curated manual AppImage seed list for packages
 * matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchManualAppImages = makeCacheSearch<ManualAppImageCacheEntry>(
  "appimage-manual",
  normalize,
);
