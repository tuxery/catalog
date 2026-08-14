// One id per connector folder under packages/sources/src/ — not a generic
// "native" bucket, so e.g. an AUR package and a Debian package stay
// distinguishable by source, not just by appId shape.
export type PackageSourceId = "flathub" | "snapcraft" | "appimage" | "aur" | "debian" | "fedora";

/**
 * A single package as reported by one source, before deduplication.
 * `@tuxery/matcher` groups several `SourcedPackage`s (one per source) into
 * one unified app.
 */
export interface SourcedPackage {
  source: PackageSourceId;
  /** Human-readable name as the source reports it (may differ slightly per source). */
  name: string;
  description: string;
  version: string;
  /**
   * The source's own stable identifier, when it has one — reverse-DNS app ID
   * for Flathub/AppImage (`org.mozilla.firefox`), snap name for Snapcraft.
   * Not directly comparable across sources without normalization.
   */
  appId?: string;
  /** Filename of the app icon, when known — used as a weak matching signal. */
  iconFilename?: string;
  /**
   * Release channel/track, source-specific: Snapcraft channels
   * (`stable`, `edge`, ...), Flathub branches (`stable`, `beta`), Debian
   * suites (`stable`, `testing`, ...), etc. No unified channel vocabulary
   * yet — see the "matching algorithm v1" card on the Tuxery GitHub Project.
   */
  channel?: string;
  /**
   * CPU architecture, when the source is arch-specific (Debian/Fedora
   * fetch one `Packages`/`primary.xml` file per arch; Flathub's appstream
   * is also fetched for one arch — see `flathub/fetch.ts`'s `ARCH`
   * constant). Not populated by any connector yet — each currently records
   * arch in its fetch metadata sidecar (`cache/<source>.meta.json`) but
   * doesn't thread it through to this normalized type. Tracked as its own
   * card ("Thread arch/channel into SourcedPackage consistently") rather
   * than half-wired per source as connectors happen to land.
   */
  arch?: string;
  homepage?: string;
}
