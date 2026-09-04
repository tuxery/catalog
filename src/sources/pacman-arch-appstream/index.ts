import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { PacmanArchAppstreamCacheEntry } from "./types";

/**
 * Searches Arch's AppStream metadata (from the `archlinux-appstream-data`
 * package) for components matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchArchAppstream = makeCacheSearch<PacmanArchAppstreamCacheEntry>(
  "pacman-arch-appstream",
  normalize,
);
