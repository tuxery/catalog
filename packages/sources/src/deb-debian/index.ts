import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { DebianCacheEntry } from "./types";

/**
 * Searches Debian's package archive for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchDebian = makeCacheSearch<DebianCacheEntry>("deb-debian", normalize);
