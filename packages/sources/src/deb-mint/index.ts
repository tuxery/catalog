import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { MintCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/deb-mint.ndjson", import.meta.url));

/**
 * Searches Linux Mint's own `main` component for packages matching
 * `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchMint(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<MintCacheEntry>(CACHE_PATH));
}
