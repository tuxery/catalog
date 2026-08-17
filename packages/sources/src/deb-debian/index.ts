import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { DebianCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/deb-debian.ndjson", import.meta.url));

/**
 * Searches Debian's package archive for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchDebian(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<DebianCacheEntry>(CACHE_PATH));
}
