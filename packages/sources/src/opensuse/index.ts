import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { OpenSuseCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/opensuse.ndjson", import.meta.url));

/**
 * Searches openSUSE Tumbleweed's package repository for packages matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchOpenSuse(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<OpenSuseCacheEntry>(CACHE_PATH));
}
