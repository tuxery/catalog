import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { AppImageCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/appimage.ndjson", import.meta.url));

/**
 * Searches known AppImage source feeds for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network — empty until `fetch.ts` is implemented (see the
 * "AppImage connector" card on the Tuxery GitHub Project).
 */
export async function searchAppImage(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<AppImageCacheEntry>(CACHE_PATH));
}
