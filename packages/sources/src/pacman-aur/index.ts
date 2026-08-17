import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { AurCacheEntry } from "./types";

/**
 * Searches the AUR for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchAur = makeCacheSearch<AurCacheEntry>("pacman-aur", normalize);
