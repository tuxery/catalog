import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { AurCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/pacman-aur.ndjson", import.meta.url));

/**
 * Searches the AUR for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchAur(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<AurCacheEntry>(CACHE_PATH));
}
