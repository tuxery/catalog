import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { MintCacheEntry } from "./types";

/**
 * Searches Linux Mint's own `main` component for packages matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchMint = makeCacheSearch<MintCacheEntry>("deb-mint", normalize);
