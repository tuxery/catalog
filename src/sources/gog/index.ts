import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { GogCacheEntry } from "./types";

/**
 * Searches GOG's Linux-compatible catalog for games matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchGog = makeCacheSearch<GogCacheEntry>("gog", normalize);
