import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { PopOsCacheEntry } from "./types";

/**
 * Searches Pop!_OS's own System76-authored packages for those matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchPopOs = makeCacheSearch<PopOsCacheEntry>("deb-popos", normalize);
