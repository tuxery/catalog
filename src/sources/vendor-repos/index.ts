import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { VendorRepoCacheEntry } from "./types";

/**
 * Searches the vendor-run apt repositories (Brave, Chrome, VS Code, ...)
 * for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchVendorRepos = makeCacheSearch<VendorRepoCacheEntry>("vendor-repos", normalize);
