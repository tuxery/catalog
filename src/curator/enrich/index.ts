import { meanBy, sum, sumBy, unique } from "@helpers4/array";
import type { PackageSourceId, SourcedPackage, StoreCollectionTag } from "../../sources";
import { looksLikeGamePackage, looksLikeGuiPackage } from "../filter/rules";
import type { MatchedApp } from "../match/group";
import {
  isAppStoreFrontend,
  loadAppStoreFrontends,
  type AppStoreFrontendEntry,
} from "./app-store-frontend";
import { pickCategory, TO_CLASSIFY } from "./category";
import { loadCategoryRules, matchCategoryRule, type CategoryRuleEntry } from "./category-rules";
import {
  categoryFromDebianSection,
  categoryFromGentooSection,
  gameGenreFromGentooSection,
} from "./category-section";
import { getCompatWarnings, loadCompatWarnings, type CompatWarningEntry } from "./compat-warnings";
import { applySuites, loadSuiteOverrides, type SuiteOverrideEntry } from "./suite";
import type { CatalogApp } from "./types";

/**
 * Preference order for picking the "representative" package a
 * `MatchedApp` group's display fields (name, description, homepage) are
 * drawn from — Flathub/Snapcraft tend to have the most human-readable
 * metadata (proper app names, real summaries), native distro packages the
 * least (terse descriptions, packager-style names). Sources not listed
 * here fall back to array order.
 */
const SOURCE_PRIORITY: PackageSourceId[] = ["flatpak-flathub", "snap-snapcraft", "appimage"];

function pickByPriority(packages: SourcedPackage[]): SourcedPackage {
  for (const source of SOURCE_PRIORITY) {
    const match = packages.find((pkg) => pkg.source === source);
    if (match) return match;
  }
  const [first] = packages;
  if (!first) throw new Error("enrichApps: a MatchedApp group had no packages");
  return first;
}

/**
 * Picks the description independently of the name/homepage
 * representative: a priority source with a blank description (e.g.
 * AppImage's feed frequently has none) shouldn't win over a lower-priority
 * source that actually has one, for the same app.
 */
function pickDescription(packages: SourcedPackage[]): string {
  const withDescription = packages.filter((pkg) => pkg.description);
  return pickByPriority(withDescription.length > 0 ? withDescription : packages).description;
}

/**
 * Picks a field from whichever member package actually has it, not
 * strictly the group's `SOURCE_PRIORITY` representative — a source
 * carrying real data for a given field (e.g. AppCenter's `license`)
 * might not itself be in `SOURCE_PRIORITY` at all (AppCenter isn't),
 * so a Snapcraft+AppCenter group's representative would otherwise never
 * see it. Falls back to `undefined` when no member package has the
 * field, same positive-evidence-only discipline as everything else in
 * this file — never guessed.
 */
function pickField<T>(
  packages: SourcedPackage[],
  getField: (pkg: SourcedPackage) => T | undefined,
): T | undefined {
  const withField = packages.filter((pkg) => getField(pkg) !== undefined);
  if (withField.length === 0) return undefined;
  return getField(pickByPriority(withField));
}

/**
 * Positive-evidence-only GUI signal: Fedora/openSUSE's direct
 * `hasDesktopFile`, or Debian/Ubuntu's weaker Section-based heuristic
 * (`looksLikeGuiPackage`, scoped to those two sources only — see that
 * function's doc comment for why other sources' `section` values don't
 * apply). Never "cli" by default; see `CatalogApp.kind`'s doc comment.
 */
function hasGuiEvidence(pkg: SourcedPackage): boolean {
  if (pkg.hasDesktopFile) return true;
  if (pkg.source === "deb-debian" || pkg.source === "deb-ubuntu") {
    return looksLikeGuiPackage(pkg.name, pkg.section);
  }
  return false;
}

/**
 * Positive-evidence-only game signal: Flathub/AppCenter's direct
 * `hasGameCategory`, or `looksLikeGamePackage`'s Section-based heuristic
 * (see that function's doc comment for which sources it applies to).
 * Never assumed "app" by default; see `CatalogApp.contentType`'s doc
 * comment.
 */
function hasGameEvidence(pkg: SourcedPackage): boolean {
  if (pkg.hasGameCategory) return true;
  return looksLikeGamePackage(pkg.source, pkg.section);
}

/**
 * Picks a category label via `pickField`, then maps it through
 * `pickCategory`'s type-scoped taxonomy. When no member package has any
 * upstream category data at all:
 * - For a game, falls back to `gameGenreFromGentooSection` (see
 *   `category-section.ts` — Gentoo's own `games-*` subcategory, e.g.
 *   games-arcade/games-rpg/games-board, already used to *detect* a game
 *   via `looksLikeGamePackage`, specific enough on several values to also
 *   predict a `categories-games.json` genre).
 * - For an app, falls back in order to `categoryRules` (see
 *   `category-rules.ts` — a name-pattern signal for well-known product
 *   families no upstream source classifies, e.g. Wine/Proton compatibility
 *   tools), then `categoryFromDebianSection`/`categoryFromGentooSection`
 *   (Debian/Ubuntu's own Section field and Gentoo's own top-level
 *   category, for the values already known to reliably predict a specific
 *   category).
 * Either path finally gives up to `TO_CLASSIFY`.
 */
function pickCategoryLabel(
  packages: SourcedPackage[],
  isGame: boolean,
  categoryRules: CategoryRuleEntry[],
): string {
  const categories = pickField(packages, (pkg) =>
    pkg.categories && pkg.categories.length > 0 ? pkg.categories : undefined,
  );
  const picked = pickCategory(categories ?? [], isGame);
  if (picked !== TO_CLASSIFY) return picked;

  if (isGame) {
    const genreMatch = packages.map(gameGenreFromGentooSection).find((genre) => genre);
    return genreMatch ?? TO_CLASSIFY;
  }

  const names = packages.map((pkg) => pkg.name);
  const nameMatch = matchCategoryRule(names, categoryRules);
  if (nameMatch) return nameMatch;

  const sectionMatch = packages
    .map((pkg) => categoryFromDebianSection(pkg) ?? categoryFromGentooSection(pkg))
    .find((category) => category);
  return sectionMatch ?? TO_CLASSIFY;
}

/**
 * Combines every member package's own rating into one count-weighted
 * average — unlike `pickField`, which picks a single source's value,
 * ratings from independent sources (e.g. a game sold on both GOG and
 * packaged on Flathub) are genuinely different votes on the same app and
 * should all count, not just the highest-priority source's. `undefined`
 * when no member package has a rating at all — never a synthetic 0.
 * Per-source figures stay readable on `CatalogApp.packages[].rating` for
 * a "ratings by source" breakdown.
 */
function aggregateRating(
  packages: SourcedPackage[],
): { average: number; count: number } | undefined {
  const rated = packages.filter(
    (pkg): pkg is SourcedPackage & { rating: { average: number; count: number } } =>
      Boolean(pkg.rating && pkg.rating.count > 0),
  );
  if (rated.length === 0) return undefined;

  const count = sumBy(rated, (pkg) => pkg.rating.count);
  const weightedSum = sumBy(rated, (pkg) => pkg.rating.average * pkg.rating.count);
  return { average: weightedSum / count, count };
}

/**
 * Averages every member package's own popularity score into one
 * app-level trending signal — unlike `rating`, there's no natural weight
 * (vote count) to skew by, so a plain mean of whichever member packages
 * have a score. `undefined` when no member package has one at all.
 */
function aggregatePopularity(packages: SourcedPackage[]): number | undefined {
  const scored = packages.filter(
    (pkg): pkg is SourcedPackage & { popularity: number } => pkg.popularity !== undefined,
  );
  if (scored.length === 0) return undefined;

  return meanBy(scored, (pkg) => pkg.popularity);
}

/**
 * The union of every member package's store-collection tags, deduplicated
 * — an app verified on Flathub AND featured on Snapcraft carries both.
 * `undefined` when no member package has any (never an empty array).
 */
function aggregateStoreCollections(packages: SourcedPackage[]): StoreCollectionTag[] | undefined {
  const tags = unique(packages.flatMap((pkg) => pkg.storeCollections ?? []));
  return tags.length > 0 ? tags : undefined;
}

/**
 * The most recent `lastUpdated` across every member package — a max, not
 * `pickField`'s source-priority pick, since an older release from a
 * higher-priority source shouldn't shadow a genuinely newer one from
 * elsewhere. ISO date strings sort correctly as plain strings.
 * `undefined` when no member package has one at all.
 */
function aggregateLastUpdated(packages: SourcedPackage[]): string | undefined {
  const dated = packages
    .map((pkg) => pkg.lastUpdated)
    .filter((date): date is string => date !== undefined);
  if (dated.length === 0) return undefined;

  return dated.reduce((latest, date) => (date > latest ? date : latest));
}

/**
 * Sums a numeric field across every member package that has one — unlike
 * `aggregatePopularity`'s mean (a 0-1 percentile score, not additive
 * across sources), install counts from independent sources genuinely add
 * up. `undefined` when no member package reports the field at all, never
 * a synthetic 0.
 */
function sumField(
  packages: SourcedPackage[],
  getField: (pkg: SourcedPackage) => number | undefined,
): number | undefined {
  const values = packages.map(getField).filter((value): value is number => value !== undefined);
  return values.length > 0 ? sum(values) : undefined;
}

/** Turns grouped packages into the display-ready `CatalogApp` records the website reads — see `types.ts` for what's populated today vs. tracked as roadmap. */
export function enrichApps(
  matched: MatchedApp[],
  suiteOverrides: SuiteOverrideEntry[] = loadSuiteOverrides(),
  appStoreFrontends: AppStoreFrontendEntry[] = loadAppStoreFrontends(),
  compatWarnings: CompatWarningEntry[] = loadCompatWarnings(),
  categoryRules: CategoryRuleEntry[] = loadCategoryRules(),
): CatalogApp[] {
  const apps: CatalogApp[] = matched.map((app) => {
    const representative = pickByPriority(app.packages);
    const warnings = getCompatWarnings(app.packages, compatWarnings);
    const isGame = app.packages.some(hasGameEvidence);

    return {
      id: app.id,
      name: representative.name,
      shortDescription: pickDescription(app.packages),
      homepage: representative.homepage,
      packages: app.packages,
      kind: app.packages.some(hasGuiEvidence) ? "gui" : undefined,
      contentType: isGame ? "game" : undefined,
      appStoreFrontend: isAppStoreFrontend(app.packages, appStoreFrontends) ? true : undefined,
      category: pickCategoryLabel(app.packages, isGame, categoryRules),
      iconUrl: pickField(app.packages, (pkg) => pkg.iconUrl),
      approxSizeBytes: pickField(app.packages, (pkg) => pkg.approxSizeBytes),
      license: pickField(app.packages, (pkg) => pkg.license),
      developer: pickField(app.packages, (pkg) => pkg.developer),
      longDescription: pickField(app.packages, (pkg) => pkg.longDescription),
      screenshots: pickField(app.packages, (pkg) =>
        pkg.screenshots && pkg.screenshots.length > 0 ? pkg.screenshots : undefined,
      ),
      languages: pickField(app.packages, (pkg) =>
        pkg.languages && pkg.languages.length > 0 ? pkg.languages : undefined,
      ),
      changelog: pickField(app.packages, (pkg) => pkg.changelog),
      lastUpdated: aggregateLastUpdated(app.packages),
      installsTotal: sumField(app.packages, (pkg) => pkg.installsTotal),
      installsLast7Days: sumField(app.packages, (pkg) => pkg.installsLast7Days),
      compatibilityWarnings: warnings.length > 0 ? warnings : undefined,
      rating: aggregateRating(app.packages),
      popularity: aggregatePopularity(app.packages),
      storeCollections: aggregateStoreCollections(app.packages),
    };
  });

  // Cross-app, so it has to run over the fully-built array rather than
  // per-app inside the map above — a component needs to look up its
  // already-enriched main app (and vice versa) by id.
  applySuites(apps, suiteOverrides);

  return apps;
}
