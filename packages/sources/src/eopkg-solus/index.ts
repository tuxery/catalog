import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { SolusCacheEntry } from "./types";

/**
 * Searches Solus's package repository for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchSolus = makeCacheSearch<SolusCacheEntry>("eopkg-solus", normalize);
