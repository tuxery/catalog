import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { AppCenterCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/appcenter.ndjson", import.meta.url));

/**
 * Searches elementary AppCenter's catalog for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchAppCenter(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<AppCenterCacheEntry>(CACHE_PATH));
}
