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
   * Not resolved yet — sources only carry a bare filename
   * (`SourcedPackage.iconFilename`), not a fetchable URL, and Snapcraft's
   * `normalize.ts` currently even discards a full icon URL down to just
   * that filename. Needs per-source base-URL resolution (and fixing the
   * Snapcraft normalize.ts regression) before this can populate.
   */
  iconUrl?: string;
  /** Not sourced yet — only short summaries exist today, no source has a separate long-form description. */
  longDescription?: string;
  /** Not sourced yet — no connector captures upstream categories (Snapcraft's sweep categories are fetch-time only, not per-package). */
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
