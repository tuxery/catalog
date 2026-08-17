import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { DeepinCacheEntry } from "./types";

/**
 * Searches Deepin's own DDE-authored packages for those matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchDeepin = makeCacheSearch<DeepinCacheEntry>("deb-deepin", normalize);
