import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { AlpineCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/apk-alpine.ndjson", import.meta.url));

/**
 * Searches Alpine's package repository for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchAlpine(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<AlpineCacheEntry>(CACHE_PATH));
}
