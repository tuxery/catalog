import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { GentooCacheEntry } from "./types";

/**
 * Searches Gentoo's Portage tree for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchGentoo = makeCacheSearch<GentooCacheEntry>("ebuild-gentoo", normalize);
