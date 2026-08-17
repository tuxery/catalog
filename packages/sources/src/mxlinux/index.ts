import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { MxLinuxCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/mxlinux.ndjson", import.meta.url));

/**
 * Searches MX Linux's own "MX Tools" packages for those matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchMxLinux(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<MxLinuxCacheEntry>(CACHE_PATH));
}
