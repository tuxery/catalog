import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { SourcedPackage } from "../types";
import { normalize } from "./normalize";
import type { FedoraCacheEntry } from "./types";

const CACHE_PATH = fileURLToPath(new URL("../../cache/rpm-fedora.ndjson", import.meta.url));

/**
 * Searches Fedora's package repository for packages matching `query`.
 *
 * Reads the git-committed cache (see AGENTS.md's "Source cache") rather
 * than the network.
 */
export async function searchFedora(query: string): Promise<SourcedPackage[]> {
  void query;
  return normalize(readNdjson<FedoraCacheEntry>(CACHE_PATH));
}
