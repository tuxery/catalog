import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { AppImageCacheEntry } from "./types";

/**
 * Searches known AppImage source feeds for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchAppImage = makeCacheSearch<AppImageCacheEntry>("appimage", normalize);
