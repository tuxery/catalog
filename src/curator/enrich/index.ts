import { meanBy, sum, sumBy, unique } from "@helpers4/array";
import type { PackageSourceId, SourcedPackage, StoreCollectionTag } from "../../sources";
import { looksLikeGamePackage, looksLikeGuiPackage } from "../filter/rules";
import type { MatchedApp } from "../match/group";
import {
  isAppStoreFrontend,
  loadAppStoreFrontends,
  type AppStoreFrontendEntry,
} from "./app-store-frontend";
import { isGameAdjacentToolCategory, pickCategory, TO_CLASSIFY } from "./category";
import { loadCategoryRules, matchCategoryRule, type CategoryRuleEntry } from "./category-rules";
import {
  loadGameCategoryRules,
  matchGameCategoryRule,
  type GameCategoryRuleEntry,
} from "./game-category-rules";
import {
  categoryFromDebianSection,
  categoryFromGentooSection,
  categoryFromOpenSuseGroup,
  categoryFromSolusPartOf,
  gameGenreFromGentooSection,
  gameGenreFromSolusSection,
} from "./category-section";
import {
  loadDescriptionCategoryRules,
  matchDescriptionCategoryRule,
  type DescriptionCategoryRuleEntry,
} from "./description-category-rules";
import {
  loadDescriptionGameCategoryRules,
  matchDescriptionGameCategoryRule,
  type DescriptionGameCategoryRuleEntry,
} from "./description-game-category-rules";
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
 * `hasGameCategory`, or `looksLikeGamePackage`'s Section/name-based
 * heuristic (see that function's doc comment for which sources it
 * applies to). Never assumed "app" by default; see `CatalogApp.contentType`'s
 * doc comment.
 */
function hasGameEvidence(pkg: SourcedPackage): boolean {
  if (pkg.hasGameCategory) return true;
  return looksLikeGamePackage(pkg.source, pkg.section, pkg.name);
}

// The same "tool for a game, not a game" phrases already verified live
// as description-category-rules.json entries (System Tools: emulators,
// Minecraft/general game launchers, mod launchers/managers, modpacks) —
// duplicated here as raw patterns rather than cross-referencing the JSON
// file by category label, since `isGameAdjacentToolDescription` needs to
// run before `pickCategoryLabel` even sees whether isGame is true, at a
// point where reusing the loaded rule list by name would be more
// indirection than three small regexes are worth. Keep these two in sync
// if either changes: a phrase added here should almost always get the
// matching description-category-rules.json entry too (and vice versa),
// since the whole point is that once a game-tagged package is
// reclassified as an app, the SAME phrase resolves it to a real category
// immediately rather than landing back in "To Classify".
const GAME_ADJACENT_TOOL_DESCRIPTION_PATTERNS: RegExp[] = [
  /^(?!.*\b(?:vst3?|lv2|clap)\b).*\bemulat/i,
  /\bminecraft\b.*\blaunch|\blaunch\w*\b.*\bminecraft\b/i,
  /\bgame launcher\b/i,
  /\bmod (launcher|manager)\b/i,
  /\bmodpack\b/i,
  // Bare "launcher"/"generator"/"assistant" — unlike description-
  // category-rules.json's app-side rules, these are safe as BARE words
  // here specifically because this check only ever runs on a package
  // already suspected to be a game (hasGameEvidence already true); the
  // apps-side ambiguity (a desktop launcher, an AI platform launcher)
  // doesn't apply to a pool that's already game-flagged. Verified live
  // against the games "To Classify" pool (2026-09-03): "launcher" 21/21
  // real tools; "generator" 11/12 (one acceptable edge case, a Minetest
  // map-generator *mod*); "assistant" 2/2.
  /\blauncher\b/i,
  /\bgenerator\b/i,
  /\bassistant\b/i,
];

// "editor"/"manager" have exactly two real counter-examples each
// (minetest-solar-plains-invector, pacman4console — both genuinely games
// with an editor/manager feature mentioned in passing), so they're kept
// out of the blanket list above and instead scoped to skip these two
// exact names, rather than dropping two otherwise-clean 15/13 and 3/1
// signals entirely.
const GAME_ADJACENT_TOOL_DESCRIPTION_NAME_EXCEPTIONS = new Set([
  "minetest-solar-plains-invector",
  "pacman4console",
]);

const GAME_ADJACENT_TOOL_DESCRIPTION_NAME_SCOPED_PATTERNS: RegExp[] = [
  /\beditor\b/i,
  /\bmanager\b/i,
];

/**
 * True when a game-tagged package's own `shortDescription` OR display
 * name uses one of the phrases already known to describe a tool *for*
 * games rather than a game — the description/name-text counterpart to
 * `isGameAdjacentToolCategory`'s categories-based check, for the many
 * packages with no secondary freedesktop category at all (a bare "Game"
 * Main Category, or no categories field whatsoever) that still describe
 * themselves unambiguously as a launcher/emulator/mod-manager. The name
 * is checked too (not just the description) because several real titles
 * put it right in the name instead — "An Anime Game Launcher"'s own
 * description is just "Play your favorite anime game on Linux", no
 * launcher-ish word at all, found live sampling the games "To Classify"
 * pool (2026-09-03). `names` (every member package's own name) is also
 * consulted for the name-scoped "editor"/"manager" patterns' two known
 * exceptions.
 */
function isGameAdjacentToolDescription(shortDescription: string, names: string[]): boolean {
  if (GAME_ADJACENT_TOOL_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(shortDescription))) {
    return true;
  }
  if (names.some((name) => GAME_ADJACENT_TOOL_DESCRIPTION_NAME_EXCEPTIONS.has(name))) {
    return false;
  }
  if (
    names.some((name) =>
      GAME_ADJACENT_TOOL_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(name)),
    )
  ) {
    return true;
  }
  return GAME_ADJACENT_TOOL_DESCRIPTION_NAME_SCOPED_PATTERNS.some((pattern) =>
    pattern.test(shortDescription),
  );
}

/**
 * The first non-`undefined` result of applying `fn` to each item, in
 * order — like `items.map(fn).find(Boolean)`, but stops calling `fn` once
 * a match is found instead of mapping the whole array first. `pkg.length`
 * is small (a handful of packages per app) so this rarely matters on its
 * own, but `pickCategoryLabel` below chains several of these per app
 * across the whole catalog, so the short-circuit adds up.
 */
function firstDefined<T, R>(items: T[], fn: (item: T) => R | undefined): R | undefined {
  for (const item of items) {
    const result = fn(item);
    if (result !== undefined) return result;
  }
  return undefined;
}

/**
 * Picks a category label via `pickField`, then maps it through
 * `pickCategory`'s type-scoped taxonomy. When no member package has any
 * upstream category data at all:
 * - For a game, falls back in order to `gameGenreFromGentooSection` (see
 *   `category-section.ts` — Gentoo's own `games-*` subcategory, e.g.
 *   games-arcade/games-rpg/games-board, already used to *detect* a game
 *   via `looksLikeGamePackage`, specific enough on several values to also
 *   predict a `categories-games.json` genre), then `gameCategoryRules`
 *   (see `game-category-rules.ts` — a name-pattern signal hand-curated
 *   from each game's own description, for well-known titles no upstream
 *   source tags with a genre at all), then `descriptionGameCategoryRules`
 *   (see `description-game-category-rules.ts` — the game-genre mirror of
 *   `descriptionCategoryRules` below, for games whose description names
 *   its own genre but whose title isn't well-known enough for a dedicated
 *   `gameCategoryRules` entry).
 * - For an app, falls back in order to `categoryRules` (see
 *   `category-rules.ts` — a name-pattern signal for well-known product
 *   families no upstream source classifies, e.g. Wine/Proton compatibility
 *   tools), then `categoryFromDebianSection`/`categoryFromGentooSection`/
 *   `categoryFromOpenSuseGroup`/`categoryFromSolusPartOf` (Debian/Ubuntu's
 *   Section field, Gentoo's top-level category, openSUSE/RPM Fusion's
 *   `<rpm:group>` value, and Solus's own `PartOf` value — each source's
 *   own package-classification field, for the values already known to
 *   reliably predict a specific category), then
 *   `descriptionCategoryRules` (see `description-category-rules.ts` — a
 *   hand-curated, sampled-and-verified keyword-phrase signal against the
 *   app's own `shortDescription`, the last and least precise resort
 *   before giving up).
 * Either path finally gives up to `TO_CLASSIFY`.
 */
function pickCategoryLabel(
  packages: SourcedPackage[],
  isGame: boolean,
  categoryRules: CategoryRuleEntry[],
  gameCategoryRules: GameCategoryRuleEntry[],
  descriptionCategoryRules: DescriptionCategoryRuleEntry[],
  descriptionGameCategoryRules: DescriptionGameCategoryRuleEntry[],
  shortDescription: string,
): string {
  const categories = pickField(packages, (pkg) =>
    pkg.categories && pkg.categories.length > 0 ? pkg.categories : undefined,
  );
  const picked = pickCategory(categories ?? [], isGame);
  if (picked !== TO_CLASSIFY) return picked;

  if (isGame) {
    const sectionGenre = firstDefined(
      packages,
      (pkg) => gameGenreFromGentooSection(pkg) ?? gameGenreFromSolusSection(pkg),
    );
    if (sectionGenre) return sectionGenre;
    const names = packages.map((pkg) => pkg.name);
    const nameGenre = matchGameCategoryRule(names, gameCategoryRules);
    if (nameGenre) return nameGenre;
    return matchDescriptionGameCategoryRule(shortDescription, descriptionGameCategoryRules) ?? TO_CLASSIFY;
  }

  const names = packages.map((pkg) => pkg.name);
  const nameMatch = matchCategoryRule(names, categoryRules);
  if (nameMatch) return nameMatch;

  const sectionMatch = firstDefined(
    packages,
    (pkg) =>
      categoryFromDebianSection(pkg) ??
      categoryFromGentooSection(pkg) ??
      categoryFromOpenSuseGroup(pkg) ??
      categoryFromSolusPartOf(pkg),
  );
  if (sectionMatch) return sectionMatch;

  return matchDescriptionCategoryRule(shortDescription, descriptionCategoryRules) ?? TO_CLASSIFY;
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
  gameCategoryRules: GameCategoryRuleEntry[] = loadGameCategoryRules(),
  descriptionCategoryRules: DescriptionCategoryRuleEntry[] = loadDescriptionCategoryRules(),
  descriptionGameCategoryRules: DescriptionGameCategoryRuleEntry[] = loadDescriptionGameCategoryRules(),
): CatalogApp[] {
  const apps: CatalogApp[] = matched.map((app) => {
    const representative = pickByPriority(app.packages);
    const shortDescription = pickDescription(app.packages);
    const warnings = getCompatWarnings(app.packages, compatWarnings);
    const categories =
      pickField(app.packages, (pkg) =>
        pkg.categories && pkg.categories.length > 0 ? pkg.categories : undefined,
      ) ?? [];
    const hasKnownGameGenre = pickCategory(categories, true) !== TO_CLASSIFY;
    const isGame =
      app.packages.some(hasGameEvidence) &&
      !isGameAdjacentToolCategory(categories) &&
      (hasKnownGameGenre ||
        !isGameAdjacentToolDescription(
          shortDescription,
          app.packages.map((pkg) => pkg.name),
        ));

    return {
      id: app.id,
      name: representative.name,
      shortDescription,
      homepage: representative.homepage,
      packages: app.packages,
      kind: app.packages.some(hasGuiEvidence) ? "gui" : undefined,
      contentType: isGame ? "game" : undefined,
      appStoreFrontend: isAppStoreFrontend(app.packages, appStoreFrontends) ? true : undefined,
      category: pickCategoryLabel(
        app.packages,
        isGame,
        categoryRules,
        gameCategoryRules,
        descriptionCategoryRules,
        descriptionGameCategoryRules,
        shortDescription,
      ),
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
