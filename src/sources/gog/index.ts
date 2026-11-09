import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { GogCacheEntry } from "./types";

/**
 * Searches GOG's Linux-compatible catalog for games matching `query`.
 *
 * Reads the private cache (tuxery/source-cache, see
 * `../_shared/cache-path.ts`) rather than the network, and finds nothing
 * without a checkout of it.
 */
export const searchGog = makeCacheSearch<GogCacheEntry>("gog", normalize);
