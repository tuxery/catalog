import { makeCacheSearch } from "../_shared/search";
import { normalize } from "./normalize";
import type { FedoraAppstreamCacheEntry } from "./types";

/**
 * Searches Fedora's AppStream metadata (from the `appstream-data` package)
 * for components matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export const searchFedoraAppstream = makeCacheSearch<FedoraAppstreamCacheEntry>(
  "rpm-fedora-appstream",
  normalize,
);
