import type { SourcedPackage } from "@tuxery/sources";

/**
 * The unified app record the website consumes — one per `MatchedApp`
 * group, with display-ready fields picked from its member packages
 * instead of making callers dig through `packages` themselves.
 *
 * Most fields below are typed now but `undefined` today: no connector in
 * `@tuxery/sources` fetches this data yet (see each field's comment for
 * why/what's missing). Tracked as a single GitHub Project card
 * ("Populate CatalogApp's rich fields per source") rather than shipped
 * silently unpopulated — same "typed now, sourced later" convention as
 * `SourcedPackage.arch?`.
 */
export interface CatalogApp {
  /** Stable id, derived from the representative package — see `enrich/index.ts`'s `SOURCE_PRIORITY`. */
  id: string;
  name: string;
  /** From the representative package's `description` (every source has one). */
  shortDescription: string;
  homepage?: string;
  /** Every `SourcedPackage` that was grouped into this app — has its own version/channel/arch per source. */
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
   * `true` for apps whose whole purpose is browsing/installing other
   * software (GNOME Software, KDE Discover, Synaptic, bauh, octopi,
   * pamac, ...) rather than end-user productivity/creativity/games —
   * grouping them under a generic category like "Utilities" buries the
   * pattern. Positive-evidence, same discipline as `kind`/`contentType`,
   * but a hand-curated exact-name list (`overrides/app-store-
   * frontends.ndjson`), not a name/description pattern — real
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
   * A directly usable icon URL, picked from whichever member package has
   * one (`SourcedPackage.iconUrl` — see `enrich/index.ts`'s `pickField`).
   * Populated by Flathub/AppCenter (AppStream's `type="remote"` icon, or
   * resolved against that source's own repo layout when absent — see
   * `_shared/appstream.ts`'s `resolveIconUrl`) and Snapcraft (a full URL
   * from its own API, previously discarded down to just a filename — a
   * regression fixed alongside this).
   */
  iconUrl?: string;
  /**
   * Long-form, multi-paragraph description — distinct from
   * `shortDescription`. Populated by Flathub/AppCenter's AppStream
   * `<description>`, flattened from its `<p>`/`<ul>`/`<ol>` structure to
   * plain text (see `_shared/appstream.ts`'s `pickLongDescription`).
   */
  longDescription?: string;
  /**
   * A single display-ready category label (e.g. "Productivity",
   * "Multimedia") — `undefined` when no member package has category
   * data, or none of it maps to a recognized category, never guessed.
   * Sourced from Flathub/AppCenter's AppStream `<categories>` only today
   * (`SourcedPackage.categories`, freedesktop.org menu spec Main
   * Categories — see `enrich/category.ts`'s `pickCategory` for the full
   * taxonomy and its real-data verification). "Game" is deliberately
   * excluded here — see `contentType` — and genre-level categorization
   * (for the Games page) isn't attempted, a separate, larger, unresolved
   * scope per the "Define the category taxonomy" GitHub Project card.
   * Snapcraft's own store categories (swept at fetch time to discover
   * the catalog) aren't threaded through per-package yet — a possible
   * second signal, not done here.
   */
  category?: string;
  /** The app's actual developer/team name — populated by Flathub/AppCenter's AppStream `<developer_name>`/`<developer>`. Distro "Maintainer"/"Packager" fields exist elsewhere but denote the packager, not a reliable proxy for this. */
  developer?: string;
  /** Not sourced yet — same caveat as `developer`; no current source distinguishes a publisher from a developer at all. */
  publisher?: string;
  /** SPDX-ish license expression (e.g. "GPL-3.0+ AND LGPL-3.0+") — populated by Flathub/AppCenter's AppStream `<project_license>`. */
  license?: string;
  /** Language codes the app is translated into — populated by Flathub/AppCenter's AppStream `<languages><lang>`. */
  languages?: string[];
  /** Not sourced yet — no connector captures installed/download size. */
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
  /** Not sourced yet — no upstream store API among current sources exposes reviews. */
  reviews?: Array<{ author: string; text: string; rating: number }>;
  /** Not sourced yet. */
  features?: string[];
  /** The newest release's own changelog text — populated by Flathub/AppCenter's AppStream `<releases><release><description>`. `undefined` when the newest release has no description (common — most releases are just a bare version tag). */
  changelog?: string;
  /** Not sourced yet. */
  requirements?: string;
  /** Not sourced yet — e.g. Flatpak permissions are declared per-app upstream, not fetched today. */
  permissions?: string[];
  /** Not sourced yet — Flathub exposes OARS content ratings for part of its catalog; not fetched today. */
  ageRating?: { system: string; value: string };
  /** No upstream signal in any current source — likely editorial/manual, not auto-extractable. */
  aiFeatures?: boolean;
  /** No upstream signal in any current source — likely editorial/manual, not auto-extractable. */
  inAppPurchases?: boolean;
  /** No upstream signal in any current source — likely editorial/manual, not auto-extractable. */
  gdprCompliant?: boolean;
  /** Manual curation only — not derived from any source, needs its own overrides-style file when picked up. */
  editorialTags?: string[];
  /**
   * Software-suite membership — a bundled "main" app (e.g. LibreOffice's
   * single Flathub flatpak, which the match tiers already fold
   * deb/Fedora's own bare `libreoffice` metapackage into) plus separately
   * installable "component" apps (LibreOffice Writer, Calc, ...) that
   * each source packages independently. Manual curation only, from
   * `overrides/suites.ndjson` — see `enrich/suite.ts`'s `applySuites`
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
   * only, from `overrides/compat-warnings.ndjson` (no external source
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
  compatibilityWarnings?: { source: string; severity: "warning" | "info"; issue: string; fix?: string }[];
}
