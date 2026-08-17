import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { VoidCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/xbps-void.ndjson", import.meta.url));

/**
 * Searches Void Linux's package repository for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchVoid(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<VoidCacheEntry>(CACHE_PATH));
}
