import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { AlpineCacheEntry } from "./types";

/**
 * Searches Alpine's package repository for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchAlpine = makeCacheSearch<AlpineCacheEntry>("apk-alpine", normalize);
