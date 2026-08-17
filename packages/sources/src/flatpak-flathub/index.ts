import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { FlathubCacheEntry } from "./types";

/**
 * Searches Flathub for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchFlathub = makeCacheSearch<FlathubCacheEntry>("flatpak-flathub", normalize);
