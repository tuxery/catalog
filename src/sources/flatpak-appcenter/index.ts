import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { AppCenterCacheEntry } from "./types";

/**
 * Searches elementary AppCenter's catalog for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchAppCenter = makeCacheSearch<AppCenterCacheEntry>("flatpak-appcenter", normalize);
