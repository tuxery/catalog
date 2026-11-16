import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { HomebrewCacheEntry } from "./types";

/**
 * Searches Homebrew's formulae and casks installable on Linux for
 * packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchHomebrew = makeCacheSearch<HomebrewCacheEntry>("brew-homebrew", normalize);
