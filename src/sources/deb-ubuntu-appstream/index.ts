import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { UbuntuAppstreamCacheEntry } from "./types";

/**
 * Searches Ubuntu's DEP-11 AppStream metadata for components matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchUbuntuAppstream = makeCacheSearch<UbuntuAppstreamCacheEntry>(
  "deb-ubuntu-appstream",
  normalize,
);
