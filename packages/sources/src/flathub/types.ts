/**
 * One `<component>` entry from Flathub's appstream repodata
 * (`hub.flathub.org/repo/appstream/x86_64/appstream.xml.gz`), the shape
 * cached after parsing. Deliberately close to the upstream XML fields
 * rather than the normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface FlathubCacheEntry {
  /** Flatpak application ID, e.g. "org.mozilla.firefox". */
  id: string;
  name: string;
  summary: string;
  version?: string;
  iconFilename?: string;
  homepage?: string;
}
