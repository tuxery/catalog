import { readNdjson } from "../_shared/ndjson";
import { cachePathFor } from "../_shared/cache-path";
import type { WikidataCacheEntry } from "./types";

export type { WikidataCacheEntry, WikidataPackageProperty } from "./types";
export { WIKIDATA_PACKAGE_PROPERTIES } from "./types";

/**
 * The cached Wikidata items (`cache/wikidata.ndjson`). Not a package source:
 * Wikidata lists no packages of its own, it links one software item to its
 * package ids on other repositories, which `src/pipeline/wikidata-bridge.ts`
 * compares with our groups. Reads the git-committed cache, never the network.
 */
export function readWikidataItems(path: string = cachePathFor("wikidata")): WikidataCacheEntry[] {
  return readNdjson<WikidataCacheEntry>(path);
}
