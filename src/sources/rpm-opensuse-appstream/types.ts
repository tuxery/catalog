import type { FetchMetadata } from "../_shared/metadata";

/**
 * One `<component>` entry from openSUSE's AppStream `appdata.xml.gz`, the
 * shape cached after parsing. Mirrors the shared `AppstreamComponent` type
 * but keeps the distro-specific bridge fields (`pkgname`, `source_pkgname`,
 * `repo`) as first-class cache data.
 */
export interface OpenSuseAppstreamCacheEntry {
  /** AppStream desktop-id, e.g. "firefox.desktop". */
  id: string;
  /** Binary package name — the join key to rpm-opensuse. */
  pkgname: string;
  /** Source package name, when different from pkgname. */
  source_pkgname?: string;
  /** Which openSUSE repo this component came from. */
  repo: "oss" | "non-oss";
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

export interface OpenSuseAppstreamFetchMetadata extends FetchMetadata {
  reposFetched: string[];
}
