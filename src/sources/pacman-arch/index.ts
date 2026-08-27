import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { ArchCacheEntry } from "./types";

/**
 * Searches Arch's official repos (core + extra) for packages matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchArch = makeCacheSearch<ArchCacheEntry>("pacman-arch", normalize);
