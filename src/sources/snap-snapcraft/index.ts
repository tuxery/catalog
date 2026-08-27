import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { SnapcraftCacheEntry } from "./types";

/**
 * Searches Snapcraft for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchSnapcraft = makeCacheSearch<SnapcraftCacheEntry>("snap-snapcraft", normalize);
