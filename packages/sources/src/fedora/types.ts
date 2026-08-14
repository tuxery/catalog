import type { FetchMetadata } from "../_shared/metadata";

/**
 * One `<package>` entry from Fedora's `primary.xml` repodata, the shape
 * cached after parsing. Deliberately close to the upstream fields rather
 * than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface FedoraCacheEntry {
  name: string;
  summary: string;
  version: string;
  homepage?: string;
}

export interface FedoraFetchMetadata extends FetchMetadata {
  release: string;
  arch: string;
}
