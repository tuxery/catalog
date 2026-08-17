import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { SolusCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/solus.ndjson", import.meta.url));

/**
 * Searches Solus's package repository for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchSolus(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<SolusCacheEntry>(CACHE_PATH));
}
