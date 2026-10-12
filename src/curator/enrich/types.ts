import type { ProjectLinks, ReleaseEntry, SourcedPackage, StoreCollectionTag } from "../../sources";
import type { HiddenType } from "./category";
import type { Companion, CompanionKind, Relation } from "../family/types";
import type { DataConfidence } from "./data-confidence";

/**
 * The unified app record the website consumes — one per `MatchedApp`
 * group, with display-ready fields picked from its member packages
 * instead of making callers dig through `packages` themselves.
 *
 * Which sources may fill each rich field, and which wins when they
 * disagree, is `field-priority.ts`'s `FIELD_PRIORITY` — docs/rich-fields.md
 * has the reasoning and how to add a source. Fields still `undefined`
 * everywhere say so ("Not sourced yet"): typed now, sourced later, same
 * convention as `SourcedPackage.arch?`.
 */
export interface CatalogApp {
  /** Stable id, derived from the representative package — see `enrich/index.ts`'s `SOURCE_PRIORITY`. */
  id: string;
  name: string;
  /** From the representative package's `description` (every source has one). */
  shortDescription: string;
  homepage?: string;
  /** The project's own links beyond `homepage` (bug tracker, source code, donations, translation...), each type taken from the highest-priority source that has one — see `SourcedPackage.links`. */
  links?: ProjectLinks;
  /** The project's releases (version and date), newest first, from the highest-priority source listing them — the product's default build only, so Firefox ESR's releases never stand for Firefox's. See `SourcedPackage.releases`. */
  releases?: ReleaseEntry[];
  /** Every `SourcedPackage` that was grouped into this app — has its own version, track, risk, flavors and provenance per source. */
  packages: SourcedPackage[];
  /**
   * "gui" when at least one member package carries positive evidence of
   * a launchable GUI app — `undefined` otherwise, deliberately not "cli"
   * by default: absence of a signal doesn't mean "not a GUI app". Two
   * signals feed this today (see `enrich/index.ts`'s `hasGuiEvidence`):
   * `SourcedPackage.hasDesktopFile` (Fedora/openSUSE's direct synthetic
   * desktop-file marker, sparse coverage but precise where present), and
   * Debian/Ubuntu's weaker Section-based heuristic (`looksLikeGuiPackage`
   * in curator's filter/rules.ts, broader coverage but empirically
   * verified against the Fedora/openSUSE signal rather than 100%
   * precise). See the "GUI vs CLI classification" GitHub Project card for
   * what's still missing: an Arch/AUR signal, and Flatpak/Snap/AppImage
   * source presence as a weaker fallback.
   */
  kind?: "gui";

  /**
   * "game" when at least one member package carries positive evidence of
   * being a game — `undefined` otherwise, same positive-evidence-only
   * discipline as `kind` (there's no reliable "confirmed not a game"
   * signal, so absence never means "definitely an app"). A different
   * axis from `kind` entirely — a game can be GUI or terminal-based (e.g.
   * a roguelike), so the two are checked independently. Two signal
   * families feed this (see `enrich/index.ts`'s `hasGameEvidence`):
   * `SourcedPackage.hasGameCategory` (Flathub/AppCenter's direct
   * AppStream `<category>Game</category>` marker, the freedesktop.org
   * menu spec's own top-level category) and `looksLikeGamePackage` in
   * curator's filter/rules.ts (Debian-family `games` Section variants,
   * Gentoo's `games-*` category, openSUSE's `Amusements/Games` group,
   * Solus's `games.*` PartOf — each checked against real data before
   * trusting it, same discipline as the GUI Section heuristic). See the
   * "Apps vs games classification is missing from the data model"
   * GitHub Project card for what's still missing: category taxonomy
   * (genre-level browsing) is a separate, larger, unresolved card this
   * doesn't attempt to solve.
   */
  contentType?: "game";

  /**
   * Set when a high-confidence LLM classification (see
   * `llm-classifications.ts`) says this isn't an app or a game at all: a
   * `library` or `other` (data, fonts, themes, add-ons, test packages, ...).
   * The app stays in the enriched list — `classify-llm` and audits still
   * see it — but `buildDataset` leaves it out of the published dataset, so
   * the site never shows it.
   */
  excluded?: HiddenType;

  /**
   * `true` for apps whose whole purpose is browsing/installing other
   * software (GNOME Software, KDE Discover, Synaptic, bauh, octopi,
   * pamac, ...) rather than end-user productivity/creativity/games —
   * grouping them under a generic category like "Utilities" buries the
   * pattern. Positive-evidence, same discipline as `kind`/`contentType`,
   * but a hand-curated exact-name list (`config/enrich-app-store-
   * tags.json`), not a name/description pattern — real
   * candidates checked against live data first (verified in the "Define
   * an 'app store / package manager frontend' category" card): each
   * describes itself too differently ("find and install new apps",
   * "managing your applications", "resources management", "Pacman
   * frontend", ...) for any common phrase to match reliably, and generic
   * names collide with unrelated packages (`discover` also matches
   * `haskell-hspec-discover`). `undefined` for every other app.
   */
  appStoreFrontend?: boolean;

  /**
   * A directly usable icon URL — see `SourcedPackage.iconUrl` for where
   * it comes from and `FIELD_PRIORITY.iconUrl` for which source wins.
   */
  iconUrl?: string;
  /**
   * Long-form, multi-paragraph description — distinct from
   * `shortDescription`. AppStream's `<description>` flattened to plain
   * text (see `_shared/appstream.ts`'s `pickLongDescription`), else a
   * store's own (Lutris).
   */
  longDescription?: string;
  /**
   * A single display-ready category label — always present, never
   * `undefined`: apps and games each draw from their own taxonomy
   * (`enrich/category.ts`'s `pickCategory`, `config/categories-apps.json`/
   * `config/categories-games.json`), and anything with no positive signal
   * at all (no member package has category data, or none of it maps to a
   * recognized category) gets `TO_CLASSIFY` ("To Classify") rather than
   * being left uncategorized — explicit product decision: every app must
   * be classified, at worst as "needs help." Upstream
   * categories first (AppStream `<categories>`, Snapcraft's, Lutris',
   * GOG's), then each distro's own section/group/keywords, then the LLM
   * classifications and description rules — see `enrich/index.ts`'s
   * `pickCategoryLabel`.
   */
  category: string;
  /** Who makes the app — never a distro packager nor a store account (that's `publisher`). See `SourcedPackage.developer`. */
  developer?: string;
  /** The store account publishing the listing (a snap's publisher, a GOG publisher) when it isn't the developer's own. Snap's today (`SourcedPackage.publisherVerified` says whether the store verified it). */
  publisher?: string;
  /** The license as its best-ranked source states it (e.g. "GPL-3.0+ AND LGPL-3.0+"): upstream's AppStream `<project_license>` first, then the packagers' — see `field-priority.ts`'s `pickLicense`. */
  license?: string;
  /** `license` as an SPDX expression, only when every license in it maps to one SPDX id without guessing ("GPL3" doesn't say -only or -or-later): see `toSpdxExpression`. Taken from a lower-ranked source that agrees with `license` when `license` itself isn't SPDX. */
  licenseSpdx?: string;
  /** Whether `license` makes the app free software (`free`) or says it's proprietary — absent when it can't tell. See `classifyLicense`. */
  licenseKind?: "free" | "proprietary";
  /** Language codes the app is translated into — populated by Flathub/AppCenter's AppStream `<languages><lang>`. */
  languages?: string[];
  /** Flathub's download size in bytes (`/api/v2/summary/<appId>`, the `stable` branch's `download_size`). Distros' installed sizes stay per package (`SourcedPackage.installedSizeBytes`): they measure something else. */
  approxSizeBytes?: number;
  /** Screenshot image URLs — populated by Flathub/AppCenter's AppStream `<screenshots>`. */
  screenshots?: string[];
  /** Not sourced yet. */
  videos?: string[];
  /**
   * A count-weighted average across every member package's own rating —
   * see `enrich/index.ts`'s `aggregateRating`. Two independent sources
   * today: GNOME's ODRS community ratings (joined into Flathub/AppCenter
   * by AppStream id, sparse coverage) and GOG's own
   * `reviewsRating`/`reviewsCount` (games only). `undefined` when no
   * member package has a rating at all, never a synthetic 0. Per-source
   * detail is already available without a separate field — read each
   * entry's own `rating` off `packages`.
   */
  rating?: { average: number; count: number };
  /**
   * A trending/popularity score (0-1) — the mean of every member
   * package's own `SourcedPackage.popularity`, see `enrich/index.ts`'s
   * `aggregatePopularity`. Not a directly meaningful percentage, only a
   * relative ranking signal for sorting a "trending" listing — AUR's
   * decayed usage `Popularity` (bulk dump, sparse real coverage) and
   * Flathub's own "Popular" collection (top 250 only) are today's two
   * sources, both already normalized to comparable 0-1 scales before
   * reaching here. `undefined` when no member package has a score.
   */
  popularity?: number;
  /**
   * The union of every member package's own
   * `SourcedPackage.storeCollections` tags — see `enrich/index.ts`'s
   * `aggregateStoreCollections`. Two independent sources today: Flathub's
   * "verified"/"recently-added"/"recently-updated" collections and
   * Snapcraft's "featured" one. `undefined` when no member package
   * carries any tag. Not to be confused with `editorialTags` below —
   * that one is Tuxery's own manual curation, this one is upstream
   * sources' own, ingested as-is.
   */
  storeCollections?: StoreCollectionTag[];
  /**
   * The sum of every member package's own `installsTotal`, when at least
   * one has one — see `enrich/index.ts`'s `aggregateInstalls`. Flathub
   * only today. `undefined` when no member package reports installs.
   */
  installsTotal?: number;
  /**
   * The sum of every member package's own `installsLast7Days` — the
   * "Download trends" homepage row's actual ranking signal, see
   * `installsTotal`'s doc comment for why a weekly figure matters
   * separately from the lifetime total.
   */
  installsLast7Days?: number;
  /** Not sourced yet — no upstream store API among current sources exposes reviews. */
  reviews?: Array<{ author: string; text: string; rating: number }>;
  /** Not sourced yet. */
  features?: string[];
  /** The newest release's own changelog text (AppStream `<releases><release><description>`), from the package `releases` came from, or another one describing that same version — see `pickReleases`. `undefined` when the newest release has no description (common — most releases are just a bare version tag). */
  changelog?: string;
  /**
   * The newest `SourcedPackage.lastUpdated` (an upstream release date)
   * among the product's default builds at stable risk — a nightly or a
   * snap's edge channel says nothing about its last release. See
   * `pickLastUpdated`. `undefined` when no member package has one.
   */
  lastUpdated?: string;
  /** Not sourced yet — AppStream's `<requires>`/`<recommends>`/`<supports>` (controls, display size, internet), as one readable summary. */
  requirements?: string;
  /** Not sourced yet — the Flathub package's own sandbox permissions (`finish-args`). Other formats' confinement belongs to each package. */
  permissions?: string[];
  /** Not sourced yet — AppStream's `<content_rating>` (OARS). */
  ageRating?: { system: string; value: string };
  /** No upstream signal in any current source — likely editorial/manual, not auto-extractable. */
  aiFeatures?: boolean;
  /** No upstream signal in any current source — likely editorial/manual, not auto-extractable. */
  inAppPurchases?: boolean;
  /** No upstream signal in any current source — likely editorial/manual, not auto-extractable. */
  gdprCompliant?: boolean;
  /** Manual curation only — not derived from any source, needs its own overrides-style file when picked up. See `storeCollections` above for the upstream-sourced counterpart (Flathub/Snapcraft's own collections) that already reduces this one's scope. */
  editorialTags?: string[];
  /**
   * Software-suite membership — a bundled "main" app (e.g. LibreOffice's
   * single Flathub flatpak, which the match tiers already fold
   * deb/Fedora's own bare `libreoffice` metapackage into) plus separately
   * installable "component" apps (LibreOffice Writer, Calc, ...) that
   * each source packages independently. Manual curation only, from
   * `config/enrich-suites.json` — see `enrich/suite.ts`'s `applySuites`
   * and that file's own comment for why this isn't auto-detected.
   * `undefined` for every app not part of a known suite (the vast
   * majority). Doesn't record which sources are "bundled" vs.
   * "component-only" as a separate field — each app's own `packages`
   * array already answers that (a source present there installs *this*
   * app directly).
   */
  suite?: {
    id: string;
    name: string;
    role: "main" | "component";
    /** Only set when `role` is `"main"`. */
    components?: { id: string; name: string }[];
    /** Only set when `role` is `"component"`. */
    mainApp?: { id: string; name: string };
  };
  /**
   * Known packaging-format compatibility issues (e.g. GNOME Boxes losing
   * KVM/libvirt device access under Snap confinement) — manual curation
   * only, from `config/enrich-compat-warnings.json` (no external source
   * covers this — checked, see the "Evaluate external sources for
   * per-app packaging-format compatibility issues" GitHub Project card),
   * `enrich/compat-warnings.ts`'s `getCompatWarnings`. Each entry is
   * scoped to the one specific `source` it affects — an app installable
   * from both a warned source and a clean one still only warns on the
   * affected row, not the whole app. `undefined` for every app with no
   * known issue (the vast majority) — deliberately narrow and exact-name
   * keyed rather than category-based, grown one verified real case at a
   * time.
   */
  compatibilityWarnings?: {
    source: string;
    severity: "warning" | "info";
    issue: string;
    fix?: string;
  }[];

  /**
   * Deterministic data-confidence signals computed from this app's own
   * member packages — see `data-confidence.ts`'s `computeDataConfidence`
   * for what feeds it (name/license agreement across sources, a
   * `config/match-force.json` human verification) and its doc comment
   * for how to read the score. Always present, even when `signals` is
   * empty (the neutral, single-source-or-nothing-to-flag default) — an
   * absent field would read as "not computed" rather than "nothing
   * found", which is a real, meaningful distinction here. A future pass
   * adds an LLM-derived coherence signal on top of these (tracked
   * separately), not yet done.
   */
  dataConfidence: DataConfidence;

  /**
   * Extensions, plugins, themes, language packs, data packs, native hosts
   * and config packages that add to this product — listed on its page,
   * never cards of their own. Set by the product-families stage
   * (`family/index.ts`'s `attachFamilies`, docs/product-families.md).
   * `undefined` when none.
   */
  companions?: Companion[];
  /** How many companions of each kind this product has in full — `companions` keeps at most 100 per kind (see `family/companions.ts`). Set together with `companions`. */
  companionCounts?: Partial<Record<CompanionKind, number>>;
  /**
   * Set on a group that is itself a companion of another product (its
   * id) — `buildDataset` leaves it out like `excluded`, and it shows up
   * in that product's `companions` instead.
   */
  companionOf?: string;
  /** Forks, successors, unofficial wrappers, ... linking this product to others, both directions — see `Relation`. `undefined` when none. */
  relations?: Relation[];
}
