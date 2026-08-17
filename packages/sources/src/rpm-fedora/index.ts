import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { FedoraCacheEntry } from "./types";

/**
 * Searches Fedora's package repository for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchFedora = makeCacheSearch<FedoraCacheEntry>("rpm-fedora", normalize);
