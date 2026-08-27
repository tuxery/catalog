import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { MxLinuxCacheEntry } from "./types";

/**
 * Searches MX Linux's own "MX Tools" packages for those matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchMxLinux = makeCacheSearch<MxLinuxCacheEntry>("deb-mxlinux", normalize);
