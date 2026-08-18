// One id per connector folder under packages/sources/src/ — `<format>-<provider>`
// rather than a bare provider name, so sources group by install mechanism
// (the install-CTA logic cares that a .deb installs the same way regardless
// of which distro ships it) rather than by distro/provider name alone. A
// few exceptions keep a bare name: appimage (single provider — a prefix
// would only earn its keep if a second AppImage seed list ever lands),
// slackware (single format+provider today, same reasoning), and gog/lutris
// (neither maps to a system package format at all — GOG sells DRM-free
// installers/Galaxy client downloads, Lutris installs via its own
// community-authored scripts — so there's no `<format>` prefix to give
// them, same single-provider reasoning as appimage/slackware).
export type PackageSourceId =
  | "flatpak-flathub"
  | "flatpak-appcenter"
  | "snap-snapcraft"
  | "appimage"
  | "pacman-aur"
  | "deb-debian"
  | "deb-ubuntu"
  | "rpm-fedora"
  | "pacman-arch"
  | "nix-nixpkgs"
  | "rpm-opensuse"
  | "apk-alpine"
  | "xbps-void"
  | "slackware"
  | "eopkg-solus"
  | "ebuild-gentoo"
  | "deb-mint"
  | "deb-popos"
  | "deb-deepin"
  | "deb-mxlinux"
  | "gog"
  | "lutris";

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
   * `games`) so it's directly comparable to Debian's bare value — Linux
   * Mint (a Debian/Ubuntu derivative publishing the identical deb822
   * format) reuses this exact vocabulary verbatim, no separate signal
   * needed. Nixpkgs
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
  /**
   * Whether this package's RPM provides list includes a synthetic
   * `application(*.desktop)` entry — RPM tooling generates this
   * automatically for any package that ships a `.desktop` file, a
   * near-direct "this installs a launchable GUI app" signal. Only
   * Fedora and openSUSE currently populate this (both parsed via
   * `_shared/rpm-repodata.ts`) — verified real but low-coverage on both
   * (~3% of packages), since most GUI apps just don't happen to trigger
   * this particular synthetic-provides convention; absence isn't
   * evidence of "not a GUI app", only `true` is meaningful. Used by
   * `@tuxery/curator`'s enrich stage to set `CatalogApp.kind` — see the
   * "GUI vs CLI classification" card for the broader (not yet
   * implemented) plan, including a weaker Debian/Ubuntu Section-based
   * heuristic.
   */
  hasDesktopFile?: boolean;
  /**
   * Whether this package's upstream metadata directly tags it as a game
   * — Flathub/AppCenter's AppStream `<categories><category>Game</category>`
   * (the freedesktop.org menu spec's own top-level category, parsed via
   * `_shared/appstream.ts`), a direct first-party signal. Used alongside
   * `@tuxery/curator`'s Section-based heuristic (Debian-family `games`
   * sections, Gentoo's `games-*` category, openSUSE's `Amusements/Games`
   * group, Solus's `games.*` PartOf) to set `CatalogApp.contentType` —
   * see `looksLikeGamePackage` in curator's filter/rules.ts. Same
   * discipline as `hasDesktopFile`: only positive evidence, absence
   * isn't evidence of "not a game".
   */
  hasGameCategory?: boolean;
  /**
   * Every raw freedesktop.org menu spec category value from this
   * package's upstream metadata (e.g. `["AudioVideo", "Player"]`) — only
   * Flathub/AppCenter currently populate this (parsed via
   * `_shared/appstream.ts`). Used by `@tuxery/curator`'s enrich stage
   * (`pickCategory` in `enrich/category.ts`) to set `CatalogApp.category`
   * — undefined/empty here means "not sourced", not "no category".
   */
  categories?: string[];
  /**
   * A directly usable icon URL — distinct from `iconFilename` (a bare
   * filename, not fetchable on its own). Only Snapcraft (a full URL from
   * its own API, previously discarded down to just a filename — see the
   * "Populate CatalogApp rich fields per source" card) and Flathub/
   * AppCenter (AppStream's `type="remote"` icon when present, else
   * resolved against that source's own repo layout — see each
   * connector's `fetch.ts`) populate this today.
   */
  iconUrl?: string;
  /** SPDX-ish license expression (e.g. "GPL-3.0+ AND LGPL-3.0+") — only Flathub/AppCenter populate this today, from AppStream's `<project_license>`. */
  license?: string;
  /** The app's actual developer/team name — only Flathub/AppCenter populate this today, from AppStream's `<developer_name>`/`<developer>`. Distro "Maintainer"/"Packager" fields exist elsewhere but denote the packager, not a reliable proxy for this. */
  developer?: string;
  /** Long-form, multi-paragraph description — distinct from `description` (every source's short one-liner). Only Flathub/AppCenter populate this today, from AppStream's `<description>`, flattened from its `<p>`/`<ul>`/`<ol>` structure to plain text (see `_shared/appstream.ts`'s `pickLongDescription`). */
  longDescription?: string;
  /** Screenshot image URLs, always full URLs already. Only Flathub/AppCenter populate this today, from AppStream's `<screenshots>`. */
  screenshots?: string[];
  /**
   * A crowd rating, when this source exposes one — `average` on a 1-5
   * scale, `count` the number of votes behind it. Only set on real
   * evidence (never a synthetic 0/0), same positive-evidence-only
   * discipline as `hasGameCategory`. Two independent sources today:
   * Flathub/AppCenter join in GNOME's ODRS community ratings by
   * AppStream id (see `_shared/odrs.ts` — sparse, ~6%/~4% real
   * coverage), and GOG exposes its own `reviewsRating`/`reviewsCount`
   * directly on its catalog API (games only). `@tuxery/curator` combines
   * every member package's rating into a count-weighted average for
   * `CatalogApp.rating` — see `enrich/index.ts`'s `aggregateRating`; the
   * per-source figures stay visible on each `SourcedPackage` here for a
   * "ratings by source" breakdown.
   */
  rating?: { average: number; count: number };
}
