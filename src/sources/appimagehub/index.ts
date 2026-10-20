import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { AppImageHubCacheEntry } from "./types";

/**
 * Searches AppImageHub's applications. Reads the private cache
 * (tuxery/source-cache, see `../_shared/cache-path.ts`), and finds nothing
 * without a checkout of it.
 */
export const searchAppImageHub = makeCacheSearch<AppImageHubCacheEntry>("appimagehub", normalize);
