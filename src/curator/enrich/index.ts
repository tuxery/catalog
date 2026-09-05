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
  categoryFromAurKeywords,
  gameGenreFromAurKeywords,
  hasAurKeywordGameEvidence,
} from "./category-keywords";
import {
  categoryFromDebianSection,
  categoryFromGentooSection,
  categoryFromNixScope,
  categoryFromOpenSuseGroup,
  categoryFromSlackwareSeries,
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
import {
  llmCategoryMap,
  loadLlmClassifications,
  pickLlmCategory,
  type LlmClassificationEntry,
} from "./llm-classifications";
import type { CatalogApp } from "./types";

/**
 * Preference order for picking the "representative" package a
 * `MatchedApp` group's display fields (name, description, homepage) are
 * drawn from — Flathub/Snapcraft tend to have the most human-readable
 * metadata (proper app names, real summaries), native distro packages the
 * least (terse descriptions, packager-style names). Sources not listed
 * here fall back to array order.
 */
const SOURCE_PRIORITY: PackageSourceId[] = [
  "flatpak-flathub",
  "snap-snapcraft",
  "appimage",
  "rpm-opensuse-appstream",
  "deb-debian-appstream",
  "deb-ubuntu-appstream",
  "rpm-fedora-appstream",
  "pacman-arch-appstream",
];

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
  if (hasAurKeywordGameEvidence(pkg)) return true;
  return looksLikeGamePackage(pkg.source, pkg.section, pkg.name);
}

// Exact package-name evidence for well-known real games that no other
// signal in this file ever catches: no upstream category, no AUR/Gentoo
// games-* section/keyword, and a description that names its own franchise
// without the genre-word-in-apposition shape `looksLikeGameDescription`
// requires (Dungeon Crawl Stone Soup's own "-tiles"/"-console" variants
// say "Roguelike RPG (Console Version)"/"Dungeon Crawl (tiles)", never
// "roguelike game" or "RPG game"). A real family (2 of Stone Soup's own 5
// packaged variants), not a one-off, but still too heterogeneous in
// phrasing to generalize by description text alone — same reasoning as
// `GAME_ADJACENT_TOOL_EXACT_NAMES`'s literal-name fallback, just for the
// opposite direction (missing positive evidence, not a false positive).
// Verified live (2026-09-04): these are the only catalog packages with
// either exact name, zero collision risk.
// Debian Jr.'s own "junior-games-*" tasksel bundles (blends.debian.org),
// carried on Debian/Ubuntu as `section: "metapackages"` — outside
// DEB_FAMILY_GAME_SECTIONS (that's the real "games" section, not this
// blend's own bucket) and, unlike most `junior-games-*` siblings (whose
// "Adventure"/"Card"/"Simulation"/... descriptions match a recognized
// genre word), "Network"/"Text" aren't in GAME_DESCRIPTION_PATTERNS'
// genre-word list. Regression found live reviewing the `use::gameplaying`
// removal above (2026-09-05): both used to pass only via that now-removed
// debtag, so they'd otherwise silently drop out of the games catalog.
const DEBIAN_JR_GAME_LITERAL_EVIDENCE = new Set(["junior-games-net", "junior-games-text"]);

const GAME_NAME_LITERAL_EVIDENCE = new Set([
  "stone-soup-tiles-git",
  "stone-soup-tiles",
  "stone-soup-console",
  ...DEBIAN_JR_GAME_LITERAL_EVIDENCE,
]);

function hasGameNameEvidence(pkg: SourcedPackage): boolean {
  return GAME_NAME_LITERAL_EVIDENCE.has(pkg.name.toLowerCase());
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
  // Minecraft-adjacent tooling that rides a Game tag (Flathub's own
  // over-broad Game categories — Cubiomes Viewer, MCA Selector, ...):
  // seed finders, chunk/map managers, viewers, editors. Sampled live
  // against the games "To Classify" pool (2026-09-03).
  /\bminecraft\b.*\b(viewers?|finders?|editors?|managers?|selectors?|seeds?|chunks?|skins?|servers?)\b/i,
  // Game-streaming clients/servers (Moonlight, Sunshine — "GameStream
  // client", "Stream games and other applications from another PC"), and
  // video recording/streaming tools whose only game flag is a stray
  // store-category on one group member (OBS Studio's unofficial snap
  // carries hasGameCategory=true against 12 category-less members).
  /\bgame ?stream(ing)?\b|\bstream(ing)?\b.{0,20}\bgames?\b/i,
  // Widened to also catch "recordings" (Pineapple Steam Recording
  // Exporter: "Export Steam game recordings to MP4 videos" rode the
  // singular/"-ing"-only pattern, missing the plural noun form) — verified
  // live against the whole games "To Classify" pool (2026-09-04): 1 real
  // match, zero unrelated collisions among already-genred real games.
  /\blive stream(ing)?\b|\brecord(?:s|ing|ings)?\b.{0,20}\b(videos?|screen)s?\b/i,
  /\bgame launcher\b/i,
  /\bmod (launcher|manager)\b/i,
  // Plural widened live (FTB Electron App: "Explore and manage FTB
  // modpacks!" rode the singular-only pattern).
  /\bmodpacks?\b/i,
  // Bare "launcher"/"generator"/"assistant"/"client" — unlike description-
  // category-rules.json's app-side rules, these are safe as BARE words
  // here specifically because this check only ever runs on a package
  // already suspected to be a game (hasGameEvidence already true); the
  // apps-side ambiguity (a desktop launcher, an AI platform launcher)
  // doesn't apply to a pool that's already game-flagged. Verified live
  // against the games "To Classify" pool (2026-09-03): "launcher" 21/21
  // real tools; "generator" 11/12 (one acceptable edge case, a Minetest
  // map-generator *mod*); "assistant" 2/2; "client" added for the
  // game-flagged GOG/streaming clients (minigalaxy, Moonlight). Widened to
  // "launchers?" (2026-09-04, ProtonPlus: "tools for Linux game
  // launchers" rode the singular-only form) — verified live: every
  // already-genred real game matching the plural (Unreal Tournament 2004
  // Launcher, Prism Launcher, OpenRSC, PokeMMO Installer, ...) carries a
  // real upstream genre category, so `hasKnownGameGenre` already shields
  // them regardless of this description check; zero actual regressions.
  /\blaunchers?\b/i,
  /\bgenerator\b/i,
  /\bassistant\b/i,
  /\bclient\b/i,
  // "Engine for Games" (Box2D: "A 2D Physics Engine for Games", soloud:
  // "portable audio engine for games") — the reversed-order counterpart to
  // description-category-rules.json's existing "game engines?" phrase,
  // which only matches "game engine" in that word order. Deliberately NOT
  // a blanket "game engine(s)" pattern here despite that JSON rule already
  // existing: verified live against the whole games "To Classify" pool
  // (2026-09-04) that "game engine" alone has 13 real regressions among
  // already-genred real games that describe themselves as their own
  // engine (minetest, darkplaces, Redot, ZQuest Classic, Commander
  // Genius, ...) with no upstream genre category to shield them — solarus/
  // Suika3/godot-classic (which DO say "game engine") are instead caught
  // via `GAME_ADJACENT_TOOL_EXACT_NAMES`/the godot-prefix pattern below,
  // never via this broader phrase.
  /\bengine for games?\b/i,
  // "Steam integration" helpers (linux-steam-integration: "Helper for
  // enabling better Steam integration on Linux") — verified live: 1 real
  // match, zero regressions.
  /\bsteam integration\b/i,
  // A randomizer *platform* for other games (Randovania), not a game
  // itself — verified live: 1 real match, zero regressions (no real game
  // describes itself with the bare noun "randomizer").
  /\brandomizer\b/i,
  // One-off literal proper nouns/acronyms for apps with no real
  // generalizable family and no other safe signal — each verified live
  // against the whole games "To Classify" pool AND the already-genred
  // real-games pool (2026-09-04): exactly 1 match apiece, zero collisions.
  /\bhomestuck\b/i, // The Unofficial Homestuck Collection (a webcomic/media archive/reader, not a game)
  /\beddn\b/i, // E:D Market Connector (Elite Dangerous Data Network companion uploader)
  /\bpokecrystal\b/i, // Polished Map++ (a Pokémon Crystal ROM-hack map/tileset editor)
  /magicseteditor/i, // MagicSetEditor family (a Magic: the Gathering custom-card design tool; no word boundary since names glue it as one CamelCase token)
  /\bambient lighting\b/i, // Firefly Luciferin (screen-ambient-lighting sync software, unrelated to gameplay despite the Game tag)
];

// Package names that start with "godot-" — Godot Engine's own build-variant/
// distro-packaging convention (godot-classic, godot-common, godot-mono-bin,
// godot-mono-beta-bin, godot-mono-git, ...), the same family
// `config/category-rules.json`'s existing "godot-*" rule already resolves
// to Developer Tools once isGame is false. Verified live against the whole
// games "To Classify" pool AND the already-genred real-games pool
// (2026-09-04): every "godot-" prefixed member across both pools is a real
// build/binding variant of the engine itself, zero unrelated collisions.
const GAME_ADJACENT_TOOL_NAME_PREFIX_PATTERNS: RegExp[] = [/^godot-/i];

// Exact package-name matches for well-known "tool for a game, not a game"
// one-offs/families whose description doesn't share a safe generalizable
// phrase — classic BSD/AUR joke-program toys riding AUR/Gentoo/Debian's
// "games" section purely by packaging convention, never actually
// interactive (fortune, cowsay, lolcat, nyancat, bb, bsod, cmatrix,
// pipes.sh, sl, xcowsay/xteddy/xpenguins/xfishtank/xcruiser/xdesktopwaves,
// doge, funny-manpages/asr-manpages, wtf, qstat, sex, sound-of-sorting,
// planarity, macopix, tdfsb, gBhed); Steam/game-launch helper daemons and
// scripts (gamemode, lsfg-vk, steamtinkerlaunch, steamcmd, scummvm-tools,
// mupen64plus-ui-console); gbml, a real Steam-game backup utility riding
// the same AUR games section despite not being a joke at all; a joystick
// test utility (sdljoytest); two programming-language runtimes mistagged
// via the same AUR/Gentoo "games" convention (alan, elixir); and a
// standalone chat-log monitor for a specific game (intelpy). Exact literal
// names rather than a broad regex since each is either a true one-off or a
// family too heterogeneous in phrasing to safely generalize by description
// text alone — surfaced by the ~59-app games "To Classify" review
// (2026-09-04); verified live that no other app anywhere in the catalog
// (game-tagged or not) carries any of these exact package names.
const GAME_ADJACENT_TOOL_EXACT_NAMES = new Set([
  "gamemode",
  "gamemode-git",
  "lsfg-vk",
  "lsfg-vk-bin",
  "lsfg-vk-git",
  "lsfg-vk-ui",
  "steamtinkerlaunch",
  "steamtinkerlaunch-git",
  "steamcmd",
  "scummvm-tools",
  "mupen64plus-ui-console",
  "gbml",
  "gbml-git",
  "sdljoytest",
  "alan",
  "elixir",
  "elixir-git",
  "solarus",
  "suika3",
  "game-data-packager",
  "intelpy",
  "fortune",
  "fortune-mod",
  "lolcat",
  "lolcat++",
  "lolcat++-bin",
  "bb",
  "bsod",
  "cmatrix",
  "cmatrix-git",
  "cowsay",
  "cowsay-bin",
  "nyancat",
  "nyancat-git",
  "pipes.sh",
  "pipes-sh",
  "sl",
  "sl-git",
  "xcowsay",
  "xteddy",
  "xpenguins",
  "xfishtank",
  "xcruiser",
  "doge",
  "funny-manpages",
  "funny-manpages-git",
  "asr-manpages",
  "wtf",
  "qstat",
  "qstat-git",
  "sex",
  "sound-of-sorting",
  "sound-of-sorting-git",
  "planarity",
  "macopix",
  "tdfsb",
  "xdesktopwaves",
  "gbhed",
]);

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

// Positive game evidence from the description text itself — the
// description-based counterpart to `hasGameEvidence`'s per-package
// signals, for the many real games whose packages carry no game
// evidence at all: Flathub/Snap apps that don't tag themselves Game in
// their AppStream, AUR builds with no genre convention in the name.
// Genre-word-in-apposition patterns only ("A simple tetris game", "A
// 2D RPG shooter game", "Classic online F1 manager game"), plus the
// "a game about X" self-description shape — each sampled live against
// the real apps "To Classify" pool (2026-09-03) before trusting.
// Deliberately NOT evidence: bare "game" (describes tools-for-games as
// often as games — "Play your favorite anime game", "asset manager for
// Eve-Online"), "gameplay"/"games" plurals (word-boundary excludes
// both), and "FPS"/genre words without "game" ("3D robot simulator" is
// Webots, a robotics-research tool, not a game).
const GAME_DESCRIPTION_PATTERNS: RegExp[] = [
  /\b(action|adventure|arcade|board|card|casino|dice|educational|family|fighting|horror|idle|logic|match-3|memory|party|pinball|platform|platformer|puzzle|racing|roguelike|rogue-like|rpg|sandbox|shooter|shooting|simulation|simulator|sports|stealth|strategy|survival|tower.?defense|trivia|tycoon|word|manager|zombie|snake|tetris|bricks?|blocks?|breakout|quiz|farm|city.?building|pet|tic.?tac.?toe) games?\b/i,
  /\bgame (based|inspired|clone)\b/i,
  /\ba game about\b/i,
];

/**
 * True when an app's own display description (or one of its member
 * packages' names) reads as a game by the genre-in-apposition patterns
 * above — positive game evidence for packages whose sources carry none,
 * the same class of signal as `hasGameEvidence`, just from text. The
 * `isGameAdjacentToolDescription` strip below still wins over this, so a
 * "game launcher"/"mod manager" description that trips the genre-word
 * pattern ("Launcher for the open-source game Unitystation" has no
 * genre-word apposition anyway) can never become a game.
 */
function looksLikeGameDescription(shortDescription: string, names: string[]): boolean {
  if (GAME_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(shortDescription))) return true;
  return names.some((name) => GAME_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(name)));
}

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
  if (
    names.some((name) =>
      GAME_ADJACENT_TOOL_NAME_PREFIX_PATTERNS.some((pattern) => pattern.test(name)),
    )
  ) {
    return true;
  }
  if (names.some((name) => GAME_ADJACENT_TOOL_EXACT_NAMES.has(name.toLowerCase()))) {
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
 *   tools), then `categoryFromAurKeywords`/`categoryFromDebianSection`/
 *   `categoryFromGentooSection`/`categoryFromOpenSuseGroup`/
 *   `categoryFromSolusPartOf`/`categoryFromSlackwareSeries`/
 *   `categoryFromNixScope` (the AUR's packager keywords, Debian/Ubuntu's
 *   Section field, Gentoo's top-level category, openSUSE/RPM Fusion's
 *   `<rpm:group>` value, Solus's own `PartOf` value, Slackware's package
 *   series, and nixpkgs' attribute-path prefix — each source's own
 *   package-classification field, for the values already known to
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
      (pkg) =>
        gameGenreFromAurKeywords(pkg) ??
        gameGenreFromGentooSection(pkg) ??
        gameGenreFromSolusSection(pkg),
    );
    if (sectionGenre) return sectionGenre;
    const names = packages.map((pkg) => pkg.name);
    const nameGenre = matchGameCategoryRule(names, gameCategoryRules);
    if (nameGenre) return nameGenre;
    return (
      matchDescriptionGameCategoryRule(shortDescription, descriptionGameCategoryRules) ??
      TO_CLASSIFY
    );
  }

  const names = packages.map((pkg) => pkg.name);
  const nameMatch = matchCategoryRule(names, categoryRules);
  if (nameMatch) return nameMatch;

  const sectionMatch = firstDefined(
    packages,
    (pkg) =>
      categoryFromAurKeywords(pkg) ??
      categoryFromDebianSection(pkg) ??
      categoryFromGentooSection(pkg) ??
      categoryFromOpenSuseGroup(pkg) ??
      categoryFromSolusPartOf(pkg) ??
      categoryFromSlackwareSeries(pkg) ??
      categoryFromNixScope(pkg),
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
  llmClassifications: LlmClassificationEntry[] = loadLlmClassifications(),
): CatalogApp[] {
  const llmCategories = llmCategoryMap(llmClassifications);
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
      (app.packages.some(hasGameEvidence) ||
        app.packages.some(hasGameNameEvidence) ||
        looksLikeGameDescription(
          shortDescription,
          app.packages.map((pkg) => pkg.name),
        )) &&
      !isGameAdjacentToolCategory(categories) &&
      (hasKnownGameGenre ||
        !isGameAdjacentToolDescription(
          shortDescription,
          app.packages.map((pkg) => pkg.name),
        ));

    const pickedCategory = pickCategoryLabel(
      app.packages,
      isGame,
      categoryRules,
      gameCategoryRules,
      descriptionCategoryRules,
      descriptionGameCategoryRules,
      shortDescription,
    );

    return {
      id: app.id,
      name: representative.name,
      shortDescription,
      homepage: representative.homepage,
      packages: app.packages,
      kind: app.packages.some(hasGuiEvidence) ? "gui" : undefined,
      contentType: isGame ? "game" : undefined,
      appStoreFrontend: isAppStoreFrontend(app.packages, appStoreFrontends) ? true : undefined,
      category:
        pickedCategory !== TO_CLASSIFY
          ? pickedCategory
          : (pickLlmCategory(llmCategories, app.id, isGame) ?? TO_CLASSIFY),
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

  applyCompanionInheritance(apps);

  return apps;
}

// Build-variant and companion-package naming conventions, stripped to
// recover the base app's name: AUR/PPA binary rebuilds (`*-bin`),
// VCS/checkout build variants (`*-git`/`*-hg`/`*-svn`/`*-bzr`/`*-cvs`/
// `*-darcs`), AppImage repackages (`*-appimage`), and the
// companion-suffix conventions from filter/rules.ts's
// GUI_SECTION_EXCLUDE_PATTERNS (`*-data`/`*-common`/`*-plugins?`/
// `*-server`/`*-icons?` — 0ad-data next to 0ad, ardour-lv2-plugins next
// to ardour, bzflag-server next to bzflag). Conservative by construction:
// exactly ONE suffix is stripped, the remainder must match another
// app's name EXACTLY (case-insensitively), and only apps that resolved
// through some real signal serve as bases — the same same-name-same-app
// assumption the matching engine itself makes across sources
// (match-deny.json exists for the known collisions).
const COMPANION_SUFFIXES = [
  "-data",
  "-common",
  "-plugins",
  "-plugin",
  "-server",
  "-icons",
  "-bin",
  "-git",
  "-hg",
  "-svn",
  "-bzr",
  "-cvs",
  "-darcs",
  "-appimage",
];

/**
 * Fills the last "To Classify" gap that no per-package signal can ever
 * cover: companion/build-variant packages whose own metadata is silent
 * (nwchem-data rides section "science" but is excluded from
 * section-based category assignment by the companion-suffix gate; an
 * AUR `*-bin`/`*-git` rebuild carries nothing but a name and
 * description). Each is the same upstream app as its base — so it
 * inherits the base's category (and contentType when the base is a
 * game), never guessing one. Verified live against the real pool
 * (2026-09-03): 633 resolvable apps, every sampled pair a genuine
 * base/variant of the same project (audacity-plugins -> Audacity,
 * code-server -> code, bitwarden-server -> Bitwarden, deadbolt-bin ->
 * DEADBOLT, ...).
 */
export function applyCompanionInheritance(apps: CatalogApp[]): void {
  const classifiedByName = new Map<string, CatalogApp>();
  for (const app of apps) {
    if (app.category !== TO_CLASSIFY) classifiedByName.set(app.name.toLowerCase(), app);
  }
  for (const app of apps) {
    if (app.category !== TO_CLASSIFY) continue;
    const lower = app.name.toLowerCase();
    const suffix = COMPANION_SUFFIXES.find(
      (candidate) => lower.endsWith(candidate) && lower.length > candidate.length + 2,
    );
    if (!suffix) continue;
    const base = classifiedByName.get(lower.slice(0, -suffix.length));
    if (!base) continue;
    app.category = base.category;
    if (base.contentType === "game") app.contentType = "game";
  }
}
