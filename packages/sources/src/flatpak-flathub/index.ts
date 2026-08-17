import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { FlathubCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/flatpak-flathub.ndjson", import.meta.url));

/**
 * Searches Flathub for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network — empty until `fetch.ts` is implemented (see the
 * "Flathub connector" card on the Tuxery GitHub Project).
 */
export async function searchFlathub(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<FlathubCacheEntry>(CACHE_PATH));
}
