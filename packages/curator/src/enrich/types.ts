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
   * desktop-file marker, ~3% coverage but 100% precise where present),
   * and Debian/Ubuntu's weaker Section-based heuristic
   * (`looksLikeGuiPackage` in curator's filter/rules.ts, broader coverage
   * but empirically verified against the Fedora/openSUSE signal rather
   * than 100% precise). See the "GUI vs CLI classification" GitHub
   * Project card for what's still missing: an Arch/AUR signal, and
   * Flatpak/Snap/AppImage source presence as a weaker fallback.
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
   * Solus's `games.*` PartOf — each sampled against real data before
   * trusting it, same discipline as the GUI Section heuristic). See the
   * "Apps vs games classification is missing from the data model"
   * GitHub Project card for what's still missing: category taxonomy
   * (genre-level browsing) is a separate, larger, unresolved card this
   * doesn't attempt to solve.
   */
  contentType?: "game";

  /**
   * Not resolved yet — sources only carry a bare filename
   * (`SourcedPackage.iconFilename`), not a fetchable URL, and Snapcraft's
   * `normalize.ts` currently even discards a full icon URL down to just
   * that filename. Needs per-source base-URL resolution (and fixing the
   * Snapcraft normalize.ts regression) before this can populate.
   */
  iconUrl?: string;
  /** Not sourced yet — only short summaries exist today, no source has a separate long-form description. */
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
  /** Not sourced yet — distro "Maintainer"/"Packager" fields exist but denote the packager, not the app's actual developer; not a reliable proxy. */
  developer?: string;
  /** Not sourced yet — same caveat as `developer`. */
  publisher?: string;
  /** Not sourced yet — e.g. Flathub/Snapcraft appstream both carry a license, not fetched today. */
  license?: string;
  /** Not sourced yet. */
  languages?: string[];
  /** Not sourced yet — no connector captures installed/download size. */
  approxSizeBytes?: number;
  /** Not sourced yet — Flathub/Snapcraft appstream carry screenshot URLs, not fetched today. */
  screenshots?: string[];
  /** Not sourced yet. */
  videos?: string[];
  /** Not sourced yet — no upstream store API among current sources exposes ratings. */
  rating?: { average: number; count: number };
  /** Not sourced yet — no upstream store API among current sources exposes reviews. */
  reviews?: Array<{ author: string; text: string; rating: number }>;
  /** Not sourced yet. */
  features?: string[];
  /** Not sourced yet. */
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
}
