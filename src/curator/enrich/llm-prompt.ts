import {
  APP_CATEGORY_LABEL_VALUES,
  GAME_CATEGORY_LABEL_VALUES,
  type AppCategoryLabel,
  type ContentType,
  type GameCategoryLabel,
  type LlmType,
} from "./category";

/**
 * The prompt `scripts/classify-llm.ts` sends and the parser for what comes
 * back, kept here (pure, no I/O) so both are unit-tested.
 *
 * The model answers a `type` (`app` | `game` | `lib` | `other`) and, for
 * `app`/`game` only, a category taken from *that type's* list; the parser
 * rejects a category that doesn't belong to the answered type. `lib` is
 * what the model writes (one token cheaper per app than "library"); the
 * parser normalizes it to `library`. Nothing about a package is decided before
 * the LLM sees it: the heuristics' own game/app guess is not passed in
 * (they only hand over what they couldn't place), and neither is the
 * source — every source mixes both (Lutris and GOG are ~90-99% games, yet
 * ship Battle.net and Discord; AUR is ~2% games, still ~1.8k of them).
 */

/** The closed category set of each content type — a category is only valid together with its type. */
export type Taxonomy = Record<ContentType, readonly string[]>;

export const TAXONOMY: Taxonomy = {
  app: APP_CATEGORY_LABEL_VALUES,
  game: GAME_CATEGORY_LABEL_VALUES,
};

// One-line glosses for the categories models confuse (measured on sampled
// answers: Utilities / System Tools / Settings overlap, "Education" vs the
// game genre "Educational", racing has no genre of its own). Typed as
// Records over the label unions, so a new category can't ship without one.
const APP_GLOSS: Record<AppCategoryLabel, string> = {
  "Developer Tools": "IDEs, compilers, debuggers, build/VCS tools, CLI tools for programmers",
  Science: "science, engineering, maths, astronomy, GIS",
  Education: "software for learning: languages, typing tutors, quizzes, school tools",
  Security: "passwords, encryption, VPN, antivirus, pentesting",
  Finance: "accounting, budgeting, trading, crypto wallets",
  "Photo & Video": "viewing, editing, converting, recording and playing photos and video",
  "Music & Audio": "players, editors, synths, trackers, audio tools",
  "Graphics & Design": "drawing, image editing, 3D, CAD, DTP",
  "Internet & Communication": "browsers, mail, chat, torrents, FTP and other network clients",
  Productivity: "office suites, notes, to-do, PDF, calendars",
  Business: "ERP, CRM, invoicing, point of sale",
  "News & Weather": "feeds, news readers, weather",
  "Travel & Navigation": "maps, GPS, route planning",
  "Books & Reference": "e-book readers, dictionaries, encyclopedias",
  "System Tools": "monitoring, disks, drivers, terminals, package managers, backups, daemons",
  Settings: "configuration panels and desktop tweak tools",
  Utilities: "small general-purpose helpers that fit nowhere else (last resort)",
};

const GAME_GLOSS: Record<GameCategoryLabel, string> = {
  Action: "shooters, fighters, beat 'em ups, action platformers",
  Adventure: "point-and-click, visual novels, narrative and exploration",
  Arcade: "retro/arcade, pinball, shoot 'em ups, simple reflex games",
  "Board & Cards": "board, card, chess, casino, tabletop",
  Puzzle: "puzzle, logic, word, tile games",
  Educational: "games made to teach, mostly for children",
  "Role-Playing": "RPGs, roguelikes, MMORPGs, MUDs",
  Simulation: "vehicles, flight, city building, management, sandbox, life sims",
  Sports: "sports and racing",
  Strategy: "real-time and turn-based strategy, 4X, tower defense",
};

function glossed<T extends string>(labels: readonly T[], gloss: Record<T, string>): string {
  return labels.map((label) => `${label} (${gloss[label]})`).join("; ");
}

/**
 * Identical for every request and placed first, so providers that discount
 * cached prefixes (Groq doesn't count them against rate limits) can reuse
 * it. The lists are spelled out, not only enforced downstream: Groq
 * validates schemas after generation rather than while decoding, and models
 * invented off-list categories when the list wasn't in the prompt. `n`
 * echoes the item's 1-based position rather than its name: two apps in one
 * batch can share a display name. Output format: see outputSchema in
 * `scripts/_llm-providers.ts` for why it's one pipe-separated string per app.
 */
export function buildSystemPrompt(): string {
  return `Classify Linux packages. Each input line is n|name|description (the description may be empty).
For each, answer its type; for app and game, also ONE category from that type's list.

type "game": a game you play (video, board or card), including clones, remakes and open-source reimplementations of a game.
type "app": a program a user runs, including software AROUND games: launchers, emulators, engines/SDKs, mod and save editors, Wine/Proton helpers.
type "lib": code for other programs to use, not run by a user: libraries, headers/-dev files, language bindings and modules.
type "other": not a program a user runs: data or asset packs, fonts, themes and icons, documentation, plugins and add-ons for another program, metapackages, test/hello-world/placeholder packages.
Decide from the name and description only. Packages come from any source and any type can appear in any batch.

app categories: ${glossed(APP_CATEGORY_LABEL_VALUES, APP_GLOSS)}
game categories: ${glossed(GAME_CATEGORY_LABEL_VALUES, GAME_GLOSS)}

k = confidence: h = the name or description makes it clear; m = plausible reading; l = description empty or vague, name opaque, or several categories fit. Prefer an honest l over a guess.
r = reason, 6 words max.

Return {"results":["n|type|category|k|r", ...]}: one string per line, in order, n echoed exactly, type and category spelled exactly as listed, category "-" for lib and other, the name NOT repeated.
Examples:
1|app|Developer Tools|h|CLI token usage analyzer
2|game|Puzzle|h|Falling-block puzzle clone
3|app|System Tools|m|Steam compatibility tool manager
4|lib|-|h|Python bindings for libfoo
5|other|-|h|Hello-world test snap
6|app|Utilities|l|Empty description`;
}

export interface BatchItem {
  id: string;
  name: string;
  description: string;
}

/** "|" and line breaks inside a field would break the one-line "n|name|desc" format. */
function cleanField(text: string): string {
  return text.replaceAll("|", "/").replaceAll(/\s+/g, " ").trim();
}

/** One "n|name|desc" line per app. */
export function buildUserPrompt(items: BatchItem[]): string {
  return items
    .map(
      (item, i) =>
        `${i + 1}|${cleanField(item.name)}|${cleanField((item.description || "").slice(0, 160))}`,
    )
    .join("\n");
}

export type Confidence = "high" | "medium" | "low";

/** One parsed answer. `category` is present exactly when `type` is `app` or `game`. */
export type BatchResult = {
  n: number;
  confidence: Confidence;
  reason: string;
} & ({ type: ContentType; category: string } | { type: Exclude<LlmType, ContentType> });

const CONFIDENCE: Record<string, Confidence> = { h: "high", m: "medium", l: "low" };

/** The model's own spelling of each type ("lib", not "library"). */
const TYPE_TOKENS: Record<string, LlmType> = {
  app: "app",
  game: "game",
  lib: "library",
  library: "library",
  other: "other",
};

function parseType(token: string): LlmType | undefined {
  const key = token.trim();
  return Object.hasOwn(TYPE_TOKENS, key) ? TYPE_TOKENS[key] : undefined;
}

/** A type without a category: the model must answer "-" (an empty field is tolerated). */
const NO_CATEGORY = new Set(["-", ""]);

/**
 * The outermost `{...}` of a reply: models with no JSON mode
 * (`plainPrompt`) tend to wrap it in a ```json fence or a sentence. Text
 * with no brace at all is returned as-is, so `JSON.parse` still throws on it.
 */
function jsonPart(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

/**
 * Parses "n|type|category|k|reason" lines into results, keeping only the
 * valid ones: n an integer, type one of app/game/lib/other, category on
 * *that type's* list for app/game (a genre on an `app` is invalid) and "-"
 * for lib/other, k one of h/m/l. An invalid line is dropped, not fatal —
 * that app just stays unclassified for a later run. The reason may itself
 * contain "|", so it's the rest of the line. Throws only when the text
 * isn't JSON at all.
 */
export function parseResults(
  text: string | undefined,
  taxonomy: Taxonomy = TAXONOMY,
): BatchResult[] {
  const entries = (JSON.parse(jsonPart(text ?? "{}")) as { results?: unknown[] }).results ?? [];
  // Some models (Gemma 4, seen 2026-10-04) put every line in one array
  // entry, newline-separated: each line still counts on its own.
  const lines = entries.flatMap((entry) => String(entry).split("\n"));
  return lines.flatMap((line): BatchResult[] => {
    const fields = line.split("|");
    // Gemini tends to echo the input's "n|name|desc" shape and repeat the
    // name ("1|ccusage|app|Developer Tools|h|...", seen 2026-09-29): when
    // the second field isn't a type but the third is, skip the name.
    if (!parseType(fields[1] ?? "") && parseType(fields[2] ?? "")) {
      fields.splice(1, 1);
    }
    const [n, rawType = "", rawCategory = "", k = "", ...reason] = fields;
    const type = parseType(rawType);
    const category = rawCategory.trim();
    const confidence = CONFIDENCE[k.trim()];
    const index = Number(n);
    if (!Number.isInteger(index) || type === undefined || !confidence) return [];
    const common = { n: index, confidence, reason: reason.join("|").trim() };
    if (type === "library" || type === "other") {
      return NO_CATEGORY.has(category) ? [{ ...common, type }] : [];
    }
    return taxonomy[type].includes(category) ? [{ ...common, type, category }] : [];
  });
}
