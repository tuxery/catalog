import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { NixpkgsCacheEntry } from "./types";

/**
 * Searches nixpkgs for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchNixpkgs = makeCacheSearch<NixpkgsCacheEntry>("nix-nixpkgs", normalize);
