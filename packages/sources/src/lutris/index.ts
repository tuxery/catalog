import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { LutrisCacheEntry } from "./types";

/**
 * Searches Lutris's published, native-Linux installers for games
 * matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchLutris = makeCacheSearch<LutrisCacheEntry>("lutris", normalize);
