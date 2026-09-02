import { fileURLToPath } from "node:url";
import { z } from "zod";
import { readJson } from "../_shared/json";
import { GameCategoryLabelSchema, type GameCategoryLabel } from "./category";
import { globToRegExp } from "./glob-match";

const GAME_CATEGORY_RULES_PATH = fileURLToPath(
  new URL("../../../config/game-category-rules.json", import.meta.url),
);

const GameCategoryRuleEntrySchema = z.object({
  pattern: z
    .string()
    .describe(
      'A simple glob matched case-insensitively against every package name in the app\'s group (not just its display name) — "*" means "any characters", everything else is literal. Same dialect as config/category-rules.json.',
    ),
  category: GameCategoryLabelSchema.describe(
    "One of config/categories-games.json's own genre labels — this is a last-resort signal for games with no upstream genre tag at all (no Flathub/AppCenter Additional Category, no Gentoo games-* subcategory), populated from each game's own description rather than guessed. Never an AppCategoryLabel — that's config/category-rules.json's job, for non-game apps.",
  ),
  reason: z
    .string()
    .describe(
      "Why this game belongs in this genre — required so the rule is auditable later, not just an unexplained line. Most entries here are one specific game rather than a product family (unlike category-rules.json), since game titles rarely share a meaningful name pattern the way vendor/ecosystem tools do.",
    ),
});

export type GameCategoryRuleEntry = z.infer<typeof GameCategoryRuleEntrySchema>;

export const GameCategoryRulesListSchema = z.array(GameCategoryRuleEntrySchema).meta({
  title: "Enrich: game category rules",
  description:
    'Hand-curated name-pattern → genre rules for games with no upstream genre signal at all (no Flathub/AppCenter Additional Category, no Gentoo games-* subcategory, so pickCategory would otherwise fall straight to "To Classify") — first matching rule wins, checked in order. Populated from each game\'s own shortDescription/longDescription (the "richer signal" the "Populate Casino/Music/Racing/Trivia/Word game genres" backlog card asked for), reviewed one by one rather than pattern-mined in bulk — see category-rules.json for the equivalent app-side mechanism.',
});

/** Loads the hand-curated game-category-rules list (`config/game-category-rules.json`, missing file reads as empty). */
export function loadGameCategoryRules(): GameCategoryRuleEntry[] {
  return readJson(GAME_CATEGORY_RULES_PATH, GameCategoryRulesListSchema);
}

/**
 * The first rule (in file order — earlier entries win) whose pattern
 * matches any of an app's member package names, or `undefined` if none
 * do. Pure — no I/O — so it's the part covered by tests. Mirrors
 * `matchCategoryRule` exactly, just scoped to `GameCategoryLabel`.
 */
export function matchGameCategoryRule(
  names: string[],
  rules: GameCategoryRuleEntry[],
): GameCategoryLabel | undefined {
  for (const rule of rules) {
    const regExp = globToRegExp(rule.pattern);
    if (names.some((name) => regExp.test(name))) return rule.category;
  }
  return undefined;
}
