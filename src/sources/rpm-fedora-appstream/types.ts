import type { FetchMetadata } from "../_shared/metadata";

/**
 * One `<component>` entry from Fedora's AppStream `fedora.xml.gz` (shipped
 * inside the `appstream-data` package), the shape cached after parsing.
 * Mirrors the shared `AppstreamComponent` type but keeps the distro-specific
 * bridge field `pkgname` as first-class cache data.
 */
export interface FedoraAppstreamCacheEntry {
  /** AppStream desktop-id, e.g. "org.gnome.gitg.desktop". */
  id: string;
  /** Binary package name — the join key to rpm-fedora. */
  pkgname: string;
  /** Source package name, when different from pkgname. */
  source_pkgname?: string;
  /** Human-readable application name. */
  name: string;
  /** Short summary. */
  summary: string;
  version?: string;
  iconFilename?: string;
  remoteIconUrl?: string;
  homepage?: string;
  hasGameCategory: boolean;
  categories: string[];
  license?: string;
  developer?: string;
  longDescription?: string;
  screenshots: string[];
  languages?: string[];
  changelog?: string;
  lastUpdated?: string;
}

export interface FedoraAppstreamFetchMetadata extends FetchMetadata {
  /** Fedora release fetched, e.g. "44". */
  release: string;
}
