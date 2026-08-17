import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { NixpkgsCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/nixpkgs.ndjson", import.meta.url));

/**
 * Searches nixpkgs for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchNixpkgs(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<NixpkgsCacheEntry>(CACHE_PATH));
}
