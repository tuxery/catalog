// One id per connector folder under src/sources/ — `<format>-<provider>`
// rather than a bare provider name, so sources group by install mechanism
// (the install-CTA logic cares that a .deb installs the same way regardless
// of which distro ships it) rather than by distro/provider name alone.
// Exceptions keep a bare name: slackware (single format+provider, same
// reasoning), and gog/lutris (neither maps to a system package format at
// all — GOG sells DRM-free installers/Galaxy downloads, Lutris installs
// via its own community-authored scripts — so there's no `<format>`
// prefix to give them). `appimage` keeps its historical bare name even
// though a second seed list (`appimage-manual`, for apps with no GitHub
// repo) now exists too — renaming would break every already-built
// CatalogApp id (`appimage:owner/repo`) and the cache file's git history
// for a purely cosmetic gain.
export type PackageSourceId =
  | "flatpak-flathub"
  | "flatpak-appcenter"
  | "snap-snapcraft"
  | "appimage"
  | "appimage-manual"
  | "appimagehub"
  | "pacman-aur"
  | "deb-debian"
  | "deb-ubuntu"
  | "rpm-fedora"
  | "pacman-arch"
  | "pacman-arch-appstream"
  | "nix-nixpkgs"
  | "rpm-opensuse"
  | "rpm-opensuse-appstream"
  | "rpm-fedora-appstream"
  | "rpm-rpmfusion"
  | "apk-alpine"
  | "xbps-void"
  | "slackware"
  | "eopkg-solus"
  | "ebuild-gentoo"
  | "deb-mint"
  | "deb-popos"
  | "deb-deepin"
  | "deb-mxlinux"
  | "deb-debian-appstream"
  | "deb-ubuntu-appstream"
  | "gog"
  | "lutris"
  | "github-releases"
  | "vendor-repos";

/**
 * A single package as reported by one source, before deduplication.
 * the curator module groups several `SourcedPackage`s (one per source) into
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
  /**
   * The AppStream component id this package is described by
   * (`org.gnome.Calendar`), when its source is AppStream — Flathub and
   * AppCenter (where it's also `appId`) and the distributions' own
   * AppStream feeds (where `appId` is the package name, `gnome-calendar`).
   * Reverse-DNS and chosen upstream, so the same app carries the same id on
   * every source: the match stage's strongest cross-source key.
   */
  appstreamId?: string;
  /** Filename of the app icon, when known — used as a weak matching signal. */
  iconFilename?: string;
  /**
   * The parallel line this package belongs to (`esr`, `17`, a Snap track)
   * — see docs/product-families.md. `undefined` is the product's default
   * line.
   */
  track?: string;
  /** How mature this build is — see `Risk`. `undefined` is `stable`. */
  risk?: Risk;
  /** Technical variants of the same release (`bin`, `appimage`, `unwrapped`, a patch set, a Lutris installer label) — see docs/product-families.md. `undefined` when none. */
  flavors?: string[];
  /** Who produced the binaries — see `Provenance`. `undefined` when unknown, never guessed. */
  provenance?: Provenance;
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
  /** Upstream project links beyond the homepage — bug tracker, source code, donations... From AppStream's `<url type="...">` (DEP11's `Url:` map). See `ProjectLinks`. */
  links?: ProjectLinks;
  /** The project's own releases, newest first (at most `MAX_RELEASES`), from AppStream's `<releases>` — version and date only: the newest one's notes are `changelog`. Distro rebuild dates never land here. */
  releases?: ReleaseEntry[];
  /**
   * The upstream project's newest release date (ISO), when the source
   * knows it — AppStream's newest `<release>` today. Never a distro
   * rebuild or a store upload date: those go in `builtAt`.
   */
  lastUpdated?: string;
  /**
   * When this package itself was built or uploaded (ISO): an RPM's build
   * time, Arch's `%BUILDDATE%`, a snap revision's release date, AUR's
   * `LastModified`. Says how fresh this listing is, not when the project
   * last released — see `lastUpdated`. Snap fills it per channel, the
   * RPM connectors from `<time build>`.
   */
  builtAt?: string;
  /**
   * Upstream package-category classification, when the source exposes
   * one. Debian/Ubuntu's `Section` field (e.g. `libs`, `games`, `doc`),
   * normalized to strip Ubuntu's component prefix (`universe/games` ->
   * `games`) so it's directly comparable to Debian's bare value — Linux
   * Mint (a Debian/Ubuntu derivative publishing the identical deb822
   * format) reuses this exact vocabulary verbatim, no separate signal
   * needed. Nixpkgs reuses this slot for its attribute-path namespace
   * prefix instead (e.g. `python313Packages`, `kdePackages`,
   * `rPackages`), and openSUSE for its RPM `<rpm:group>` value (a
   * hierarchical path, e.g. `Development/Libraries/C and C++` — unlike
   * Fedora, which uses the same RPM field but leaves it "Unspecified" on
   * real data, openSUSE actually populates it). Differently-shaped per
   * source (fixed vocabulary, version-numbered namespace, or
   * hierarchical path) but the same underlying purpose. Used by
   * the curator module's filter as an additional noise signal alongside
   * name patterns — see `filter/rules.ts`'s `looksLikeSupportSection`.
   * Fedora and Arch's `desc` format don't populate this, and neither
   * Alpine's `APKINDEX` format nor Void's `index.plist` have an
   * equivalent field at all. Slackware reuses this slot for its package
   * "series" — a short component code from `PACKAGE LOCATION` (e.g. `l`
   * for libraries, `kde`, `xfce`, `y` for games), Slackware's own
   * closest thing to a Section vocabulary, though far coarser than
   * Debian's. Solus reuses this slot again for its `PartOf` value — a
   * dotted hierarchical grouping (e.g. `games.strategy`,
   * `programming.library`), richer than Slackware's but not as strictly
   * hierarchical as openSUSE's RPM Group path.
   */
  section?: string;
  /**
   * Whether this package's RPM provides list includes a synthetic
   * `application(*.desktop)` entry — RPM tooling generates this
   * automatically for any package that ships a `.desktop` file, a
   * near-direct "this installs a launchable GUI app" signal. Only
   * Fedora and openSUSE currently populate this (both parsed via
   * `_shared/rpm-repodata.ts`) — low coverage but precise where present,
   * since most GUI apps just don't happen to trigger this particular
   * synthetic-provides convention; absence isn't evidence of "not a GUI
   * app", only `true` is meaningful. Used by the curator module's enrich
   * stage to set `CatalogApp.kind` — see the "GUI vs CLI classification"
   * card for the broader (not yet implemented) plan, including a weaker
   * Debian/Ubuntu Section-based heuristic.
   */
  hasDesktopFile?: boolean;
  /**
   * Whether this package's upstream metadata directly tags it as a game
   * — Flathub/AppCenter's AppStream `<categories><category>Game</category>`
   * (the freedesktop.org menu spec's own top-level category, parsed via
   * `_shared/appstream.ts`), or Snapcraft's own dedicated "games" store
   * category (see snap-snapcraft/fetch.ts's `applyCategories`) — a direct
   * first-party signal either way. Used alongside
   * the curator module's Section-based heuristic (Debian-family `games`
   * sections, Gentoo's `games-*` category, openSUSE's `Amusements/Games`
   * group, Solus's `games.*` PartOf) to set `CatalogApp.contentType` —
   * see `looksLikeGamePackage` in curator's filter/rules.ts. Same
   * discipline as `hasDesktopFile`: only positive evidence, absence
   * isn't evidence of "not a game".
   */
  hasGameCategory?: boolean;
  /**
   * Every raw freedesktop.org menu spec category value from this
   * package's upstream metadata (e.g. `["AudioVideo", "Player"]`) —
   * Flathub/AppCenter populate this from AppStream (parsed via
   * `_shared/appstream.ts`); Snapcraft populates it too, translated from
   * its own, differently-shaped store-category vocabulary to the closest
   * matching freedesktop tag (see snap-snapcraft/fetch.ts's
   * `SNAP_CATEGORY_TO_FREEDESKTOP` — only the categories verified to line
   * up cleanly are translated, most of Snapcraft's vocabulary has no
   * equivalent and is left untranslated). Used by the curator module's
   * enrich stage
   * (`pickCategory` in `enrich/category.ts`) to set `CatalogApp.category`
   * — undefined/empty here means "not sourced", not "no category".
   */
  categories?: string[];
  /**
   * The source's own free-form tags for this package, when it exposes
   * any — AUR's packager-submitted `Keywords` today (e.g.
   * `["game", "wine"]`). Deliberately passed through verbatim: this is
   * a free-form vocabulary, not a controlled one, so interpretation
   * (which tags are trustworthy signals for what) lives in the curator
   * module, which verifies per-keyword against real samples before
   * trusting any of them — same discipline as `section`'s per-value
   * mappings. `undefined`/empty means "not sourced", not "untagged".
   */
  keywords?: string[];
  /**
   * A directly usable icon URL — distinct from `iconFilename` (a bare
   * filename, not fetchable on its own). AppStream's `type="remote"` icon,
   * else resolved against the source's own icon layout (see
   * `_shared/appstream.ts`'s `resolveIconUrl`), and Snapcraft's own full
   * URL.
   */
  iconUrl?: string;
  /** The license as the source states it (e.g. "GPL-3.0+ AND LGPL-3.0+") — AppStream's `<project_license>`, or the packager's license field (AUR). See docs/rich-fields.md for which source wins. */
  license?: string;
  /** The app's actual developer/team name — AppStream's `<developer_name>`/`<developer>`, GOG's developer. Distro "Maintainer"/"Packager" fields denote the packager and never land here, nor a store account (`publisher`). */
  developer?: string;
  /** The store account publishing this listing (a snap's publisher, a GOG publisher), which may not be the developer. */
  publisher?: string;
  /** Whether the store verified `publisher`'s identity (Snap's `validation: "verified"`). Only ever `true` — `undefined` when unverified or unknown. */
  publisherVerified?: boolean;
  /** Long-form, multi-paragraph description — distinct from `description` (every source's short one-liner). AppStream's `<description>` (Flathub, AppCenter and the distro AppStream feeds), flattened from its `<p>`/`<ul>`/`<ol>` structure to plain text (see `_shared/appstream.ts`'s `pickLongDescription`). */
  longDescription?: string;
  /** Screenshot image URLs, always full URLs already — AppStream's `<screenshots>`, GOG's. */
  screenshots?: string[];
  /** Free-form tags the maintainers chose for the project — a GitHub repo's topics. Kept per package, not interpreted. */
  topics?: string[];
  /** When the project's repository last received a push (ISO) — a sign the project is alive, not a release or build date. GitHub repos only. */
  pushedAt?: string;
  /** Video files (MP4/WebM, never a streaming page), one per screenshot that has one — AppStream's `<screenshot><video>`. */
  videos?: string[];
  /** This source's content rating, with the minimum age it implies — see `AgeRating`. */
  ageRating?: AgeRating;
  /** The app's own brand colors, one per color scheme (`#rrggbb`) — AppStream's `<branding>`. A background tint meant to sit behind the app's icon and name, so the page picks the one matching the visitor's scheme. See `BrandColors`. */
  brandColors?: BrandColors;
  /** AppStream's `<kudos>` as the developer states them (`HiDpiIcon`, `HighContrast`, `ModernToolkit`, `UserDocs`...). Flathub only, ~25 apps. */
  kudos?: string[];
  /** What the app needs and supports (controls, display size, internet) as one readable line, from AppStream's `<requires>`/`<recommends>`/`<supports>`. */
  requirements?: string;
  /** The sandbox permissions the package asks for, one readable line each — Flatpak's `finish-args`. */
  permissions?: string[];
  /** Language codes the app is translated into (e.g. ["en_US", "de", "fr"]) — AppStream's `<languages><lang>`. */
  languages?: string[];
  /** The newest release's own changelog text, flattened the same way as `longDescription` — AppStream's `<releases><release><description>`. `undefined` when the newest release has no description (common — most releases are just a bare version tag, no notes). */
  changelog?: string;
  /**
   * A crowd rating, when this source exposes one — `average` on a 1-5
   * scale, `count` the number of votes behind it. Only set on real
   * evidence (never a synthetic 0/0), same positive-evidence-only
   * discipline as `hasGameCategory`. Two independent sources today:
   * Flathub/AppCenter join in GNOME's ODRS community ratings by
   * AppStream id (see `_shared/odrs.ts` — sparse real coverage), and GOG
   * exposes its own `reviewsRating`/`reviewsCount` directly on its
   * catalog API (games only). the curator module combines
   * every member package's rating into a count-weighted average for
   * `CatalogApp.rating` — see `enrich/index.ts`'s `aggregateRating`; the
   * per-source figures stay visible on each `SourcedPackage` here for a
   * "ratings by source" breakdown.
   */
  rating?: { average: number; count: number };
  /**
   * A trending/popularity score, when this source exposes a real ranking
   * signal — normalized to 0-1 *within this source's own distribution*
   * (a percentile-style rank, e.g. 1 for the single most popular real
   * entry), not a directly comparable absolute count across sources the
   * way `rating` is. Two independent sources today: AUR's own decayed
   * usage-frequency `Popularity` field (already present in the bulk
   * metadata dump every `pacman-aur` fetch already downloads — only
   * entries with any real votes get a score) and Flathub's own "Popular"
   * collection API (a live top-250 ranked list — apps outside it get no
   * score, never a fake bottom value). the curator module averages
   * whichever member packages have a score into `CatalogApp.popularity`
   * — see `enrich/index.ts`'s `aggregatePopularity`.
   */
  popularity?: number;
  /**
   * Collection tags this package appears in, when the source publishes
   * real curation rather than an algorithmic ranking — unlike
   * `popularity` (a ranked score), these are membership flags: an app
   * either is or isn't in a given collection. Three sources today:
   * Flathub's own "verified" (developer-identity-verified, the full
   * list, not just a top-N), "recently-added", and "recently-updated"
   * collections (both top-250 ranked feeds, same "not a full census"
   * scope as `popularity`'s own Flathub source), and Snapcraft's
   * "featured" collection (`?featured=true`, ~100 hand-picked snaps).
   * `undefined`/empty means "not sourced", never "not featured". Not to
   * be confused with `CatalogApp.editorialTags` — that one is
   * Tuxery's *own*, manually-curated picks (an overrides file, not yet
   * built); this one is what the upstream sources themselves already
   * curate, ingested as-is.
   */
  storeCollections?: StoreCollectionTag[];
  /**
   * Lifetime install count from this source's own stats, when it exposes
   * one — Flathub's `/api/v2/stats/<appId>` today (`installs_total`),
   * verified live (Firefox: 12M+). Snapcraft's `v2/snaps/info/<name>`
   * confirmed to NOT expose an equivalent figure.
   */
  installsTotal?: number;
  /**
   * The last 7 days' worth of installs, summed from this source's own
   * daily time series — Flathub's `installs_per_day`. The actual ranking
   * signal for a "Download trends" listing; `installsTotal` alone would
   * always favor old, long-established apps over ones genuinely
   * popular *right now*. `undefined` when the source has fewer than 7
   * days of history yet (a very recently published app).
   */
  installsLast7Days?: number;
  /**
   * Approximate download size in bytes, when the source exposes one —
   * Flathub's own `/api/v2/summary/<appId>` (`branches.stable.download_size`,
   * the same `stable` build `flatpak install` targets by default), verified
   * live (Firefox: ~125MB). No other current source exposes an equivalent
   * figure.
   */
  approxSizeBytes?: number;
  /**
   * Installed size in bytes, as the package manager reports it (RPM's
   * `size installed`, Arch's `%ISIZE%`, Debian's `Installed-Size`). Not
   * comparable to `approxSizeBytes` (a Flatpak download without its
   * runtime), so it stays per package. Filled by the RPM, Arch, Alpine, Void,
   * Solus and Debian/Ubuntu connectors.
   */
  installedSizeBytes?: number;
  /** See `FormalSignals`. Used by the curator only — the store doesn't publish it. */
  formal?: FormalSignals;
}

/**
 * Maturity inside a track (docs/product-families.md): `candidate` is a
 * release candidate, or a stable release the distro is still testing
 * (Gentoo `~amd64`); `nightly` covers Snap's `edge`; `git` is built from
 * the development branch head. `stable` is never stored — it's the
 * default an absent `risk` means.
 */
export type Risk = "candidate" | "beta" | "nightly" | "git";

/**
 * Who produced a package's binaries (docs/product-families.md):
 * `upstream` the project itself, `distro` a distribution rebuilding it
 * from source, `community-repack` a community packager repackaging
 * upstream's own binaries, `community-patched` a community build with
 * extra patches.
 */
export type Provenance = "upstream" | "distro" | "community-repack" | "community-patched";

/**
 * Relationships a source's own metadata formally declares for one
 * package — the strongest signals behind product families (see
 * docs/product-families.md, "Signals"). Package names only: version
 * constraints, architecture qualifiers and synthetic capabilities
 * (`libfoo.so()`, `pkgconfig(...)`, file paths) are stripped, and a
 * package never lists itself. Every field is `undefined` when the
 * source doesn't declare it, never an empty array.
 */
export interface FormalSignals {
  /** The source package this binary package was built from, when it differs from the package's own name — AUR/Arch `pkgbase`, Debian `Source`, RPM source rpm. Siblings of one split build (`firefox-esr-i18n-*`) share it. */
  base?: string;
  /** Names this package can stand in for — AUR/Arch `provides`, Debian `Provides`, RPM `provides`. */
  provides?: string[];
  /** Names this package can't be installed alongside — AUR/Arch `conflicts`, Debian `Conflicts`, RPM `conflicts`. */
  conflicts?: string[];
  /** Packages this one supersedes — AUR/Arch `replaces`, Debian `Replaces`, RPM `obsoletes`, AppStream `<replaces>`. */
  replaces?: string[];
  /** Hard runtime dependencies — AUR/Arch `depends`, Debian `Depends`/`Pre-Depends` (alternatives flattened), RPM `requires`. */
  depends?: string[];
  /** Packages this one adds to — Debian `Enhances`, RPM `enhances`/`supplements`. */
  enhances?: string[];
  /** AppStream ids this add-on extends (`<extends>`), only on `componentType: "addon"`. */
  extends?: string[];
  /** AppStream component type when the source is AppStream (`desktop-application`, `console-application`, `addon`, `localization`, ...). */
  componentType?: string;
}

/**
 * An app's brand colors from AppStream's `<branding>`: the `primary` color
 * for each color scheme, as `#rrggbb`. A color with no scheme preference
 * fills both. Only the schemes the app declares are present.
 */
export interface BrandColors {
  light?: string;
  dark?: string;
}

/**
 * A content rating as one source states it, with the minimum age it
 * implies so that ratings from different systems share one scale.
 */
export interface AgeRating {
  /** The rating system: `OARS` (AppStream), `PEGI` or `ESRB` (GOG). */
  system: string;
  /** The source's own wording, for the per-source detail: OARS's strongest intensity (`none`, `mild`, `moderate`, `intense`), or the PEGI/ESRB age. */
  value: string;
  /** Minimum age in years on the unified scale; 0 for all ages. OARS goes through Common Sense Media's table, see `_shared/oars.ts`. */
  minAge: number;
}

export type StoreCollectionTag = "verified" | "recently-added" | "recently-updated" | "featured";

/**
 * AppStream's `<url>` types other than `homepage`
 * (https://www.freedesktop.org/software/appstream/docs/chap-Metadata.html#tag-url),
 * each the upstream project's own link.
 */
export const PROJECT_LINK_TYPES = [
  "bugtracker",
  "vcs-browser",
  "donation",
  "translate",
  "contribute",
  "help",
  "faq",
  "contact",
] as const;

export type ProjectLinkType = (typeof PROJECT_LINK_TYPES)[number];

export type ProjectLinks = Partial<Record<ProjectLinkType, string>>;

/** One upstream release, as AppStream's `<release version="..." timestamp="...">` lists it. */
export interface ReleaseEntry {
  version: string;
  /** ISO date, when the release carries a timestamp. */
  date?: string;
}

/** Releases kept per package: enough for a history and an activity signal, small enough for the committed caches. */
export const MAX_RELEASES = 10;
