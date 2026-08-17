// One id per connector folder under packages/sources/src/ — not a generic
// "native" bucket, so e.g. an AUR package and a Debian package stay
// distinguishable by source, not just by appId shape.
export type PackageSourceId =
  | "flathub"
  | "snapcraft"
  | "appimage"
  | "aur"
  | "debian"
  | "ubuntu"
  | "fedora"
  | "arch"
  | "nixpkgs"
  | "opensuse"
  | "alpine"
  | "void"
  | "slackware"
  | "solus"
  | "gentoo";

/**
 * A single package as reported by one source, before deduplication.
 * `@tuxery/curator` groups several `SourcedPackage`s (one per source) into
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
  /**
   * Upstream last-modified/last-released date, when the source exposes
   * one. Not populated by any connector yet — none of the current
   * fetch.ts implementations capture it, tracked alongside the rest of
   * `CatalogApp`'s unpopulated fields on the Tuxery GitHub Project.
   */
  lastUpdated?: string;
  /**
   * Upstream package-category classification, when the source exposes
   * one. Debian/Ubuntu's `Section` field (e.g. `libs`, `games`, `doc`),
   * normalized to strip Ubuntu's component prefix (`universe/games` ->
   * `games`) so it's directly comparable to Debian's bare value. Nixpkgs
   * reuses this slot for its attribute-path namespace prefix instead
   * (e.g. `python313Packages`, `kdePackages`, `rPackages`), and openSUSE
   * for its RPM `<rpm:group>` value (a hierarchical path, e.g.
   * `Development/Libraries/C and C++` — unlike Fedora, which uses the
   * same RPM field but leaves it "Unspecified" on real data, openSUSE
   * actually populates it, 69% non-empty). Differently-shaped per source
   * (fixed vocabulary, version-numbered namespace, or hierarchical path)
   * but the same underlying purpose. Used by `@tuxery/curator`'s filter
   * as an additional noise signal alongside name patterns — see
   * `filter/rules.ts`'s `looksLikeSupportSection`. Fedora and Arch's
   * `desc` format don't populate this, and neither Alpine's `APKINDEX`
   * format nor Void's `index.plist` have an equivalent field at all
   * (verified against their real schemas — Alpine:
   * P/V/A/S/I/T/U/L/o/m/t/c/D/p/i/k only; Void: architecture, homepage,
   * license, maintainer, pkgver, provides, run_depends, shlib-requires,
   * short_desc, source-revisions, sourcepkg only — no category/group
   * field in either). Slackware reuses this slot for its package
   * "series" — a short component code from `PACKAGE LOCATION` (e.g. `l`
   * for libraries, `kde`, `xfce`, `y` for games), Slackware's own
   * closest thing to a Section vocabulary, though far coarser than
   * Debian's (15 series total across the whole tree). Solus reuses this
   * slot again for its `PartOf` value — a dotted hierarchical grouping
   * (e.g. `games.strategy`, `programming.library`), 115 distinct values
   * on real data, richer than Slackware's but not as strictly
   * hierarchical as openSUSE's RPM Group path.
   */
  section?: string;
}
