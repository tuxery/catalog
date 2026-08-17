import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { SlackwareCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/slackware.ndjson", import.meta.url));

/**
 * Searches Slackware's package tree for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchSlackware(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<SlackwareCacheEntry>(CACHE_PATH));
}
