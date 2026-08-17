import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { DeepinCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/deb-deepin.ndjson", import.meta.url));

/**
 * Searches Deepin's own DDE-authored packages for those matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchDeepin(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<DeepinCacheEntry>(CACHE_PATH));
}
