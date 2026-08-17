import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { PopOsCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/deb-popos.ndjson", import.meta.url));

/**
 * Searches Pop!_OS's own System76-authored packages for those matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchPopOs(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<PopOsCacheEntry>(CACHE_PATH));
}
