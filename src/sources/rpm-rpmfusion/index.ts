import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { RpmFusionCacheEntry } from "./types";

/**
 * Searches RPM Fusion's cache for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchRpmFusion = makeCacheSearch<RpmFusionCacheEntry>("rpm-rpmfusion", normalize);
