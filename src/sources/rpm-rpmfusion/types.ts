import type { FetchMetadata } from "../_shared/metadata";

/**
 * One `<package>` entry from RPM Fusion's `primary.xml` repodata, the
 * shape cached after parsing. Deliberately close to the upstream fields
 * rather than the normalized `SourcedPackage` — see `normalize.ts`. Unlike
 * Fedora's own repo (where `<rpm:group>` is essentially always
 * "Unspecified" on real data), RPM Fusion actually populates it with real
 * values like "Amusements/Games" and "Applications/Multimedia" — kept
 * here, unlike `rpm-fedora/types.ts`, which drops it for exactly that
 * reason.
 */
export interface RpmFusionCacheEntry {
  name: string;
  summary: string;
  version: string;
  homepage?: string;
  group?: string;
  hasDesktopFile: boolean;
}

export interface RpmFusionFetchMetadata extends FetchMetadata {
  release: string;
  arch: string;
}
