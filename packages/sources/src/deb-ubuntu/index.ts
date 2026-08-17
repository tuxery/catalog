import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { UbuntuCacheEntry } from "./types";

/**
 * Searches Ubuntu's package archive for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchUbuntu = makeCacheSearch<UbuntuCacheEntry>("deb-ubuntu", normalize);
