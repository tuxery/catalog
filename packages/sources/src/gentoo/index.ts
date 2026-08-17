import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { GentooCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/gentoo.ndjson", import.meta.url));

/**
 * Searches Gentoo's Portage tree for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchGentoo(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<GentooCacheEntry>(CACHE_PATH));
}
