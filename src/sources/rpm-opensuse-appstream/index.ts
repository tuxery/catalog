import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { OpenSuseAppstreamCacheEntry } from "./types";

/**
 * Searches openSUSE's AppStream appdata for components matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchOpenSuseAppstream = makeCacheSearch<OpenSuseAppstreamCacheEntry>(
  "rpm-opensuse-appstream",
  normalize,
);
