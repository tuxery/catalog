import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { OpenSuseCacheEntry } from "./types";

/**
 * Searches openSUSE Tumbleweed's package repository for packages matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchOpenSuse = makeCacheSearch<OpenSuseCacheEntry>("rpm-opensuse", normalize);
