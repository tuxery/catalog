import type { FetchMetadata } from "../_shared/metadata";

/**
 * One `<component>` entry from Arch's AppStream `archlinux.xml.gz` (shipped
 * inside the `archlinux-appstream-data` package, split per repo into
 * `core.xml.gz`/`extra.xml.gz`/`multilib.xml.gz`), the shape cached after
 * parsing. Mirrors the shared `AppstreamComponent` type but keeps the
 * distro-specific bridge field `pkgname` as first-class cache data.
 */
export interface PacmanArchAppstreamCacheEntry {
  /** AppStream desktop-id, e.g. "org.gnome.gitg.desktop". */
  id: string;
  /** Binary package name — the join key to pacman-arch. */
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

export interface PacmanArchAppstreamFetchMetadata extends FetchMetadata {
  /** The `archlinux-appstream-data` package filename fetched, e.g. "archlinux-appstream-data-20260821-1-any.pkg.tar.zst". */
  packageFilename: string;
}
