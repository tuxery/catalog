import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { VoidCacheEntry } from "./types";

/**
 * Searches Void Linux's package repository for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchVoid = makeCacheSearch<VoidCacheEntry>("xbps-void", normalize);
