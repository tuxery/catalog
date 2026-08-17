import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { ArchCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/pacman-arch.ndjson", import.meta.url));

/**
 * Searches Arch's official repos (core + extra) for packages matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchArch(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<ArchCacheEntry>(CACHE_PATH));
}
