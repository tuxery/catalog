import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { UbuntuCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/deb-ubuntu.ndjson", import.meta.url));

/**
 * Searches Ubuntu's package archive for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchUbuntu(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<UbuntuCacheEntry>(CACHE_PATH));
}
