import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { SnapcraftCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/snapcraft.ndjson", import.meta.url));

/**
 * Searches Snapcraft for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network — empty until `fetch.ts` is implemented (see the
 * "Snapcraft connector" card on the Tuxery GitHub Project).
 */
export async function searchSnapcraft(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<SnapcraftCacheEntry>(CACHE_PATH));
}
