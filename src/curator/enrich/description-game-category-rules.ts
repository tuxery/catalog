import { fileURLToPath } from "node:url";
import { memoize } from "@helpers4/function";
import { z } from "zod";
import { readJson } from "../_shared/json";
import { GameCategoryLabelSchema, type GameCategoryLabel } from "./category";

const DESCRIPTION_GAME_CATEGORY_RULES_PATH = fileURLToPath(
  new URL("../../../config/description-game-category-rules.json", import.meta.url),
);

const DescriptionGameCategoryRuleEntrySchema = z.object({
  pattern: z
    .string()
    .describe(
      "A JavaScript regular expression source string, matched case-insensitively against the game's own `shortDescription` (never `longDescription`, same reasoning as description-category-rules.ts). Always a multi-word phrase or an unambiguous genre-specific term with `\\b` word boundaries.",
    ),
  category: GameCategoryLabelSchema.describe(
    "One of config/categories-games.json's own genre labels — this is the last-resort signal for games with no upstream genre tag, no Gentoo games-* subcategory match, and no game-category-rules.json name match either.",
  ),
  reason: z
    .string()
    .describe(
      "Why this phrase reliably predicts this genre — required so the rule is auditable later, not just an unexplained line.",
    ),
});

export type DescriptionGameCategoryRuleEntry = z.infer<
  typeof DescriptionGameCategoryRuleEntrySchema
>;

export const DescriptionGameCategoryRulesListSchema = z
  .array(DescriptionGameCategoryRuleEntrySchema)
  .meta({
    title: "Enrich: description game category rules",
    description:
      'Hand-curated keyword-phrase → genre rules matched against a game\'s own shortDescription, for games with no upstream genre, no Gentoo games-* subcategory match, and no game-category-rules.json name match either — the last resort before "To Classify". First matching rule wins, checked in order. Mirrors description-category-rules.ts exactly, just scoped to GameCategoryLabel — game descriptions are usually genre-explicit ("a roguelike deckbuilder", "a turn-based strategy game"), so this is a comparably strong signal to the app-side equivalent despite the much smaller classified-games training set.',
  });

/** Loads the hand-curated description-game-category-rules list (`config/description-game-category-rules.json`, missing file reads as empty). */
export function loadDescriptionGameCategoryRules(): DescriptionGameCategoryRuleEntry[] {
  return readJson(DESCRIPTION_GAME_CATEGORY_RULES_PATH, DescriptionGameCategoryRulesListSchema);
}

// Same "compile once, reuse across every app" reasoning as
// description-category-rules.ts's compilePattern.
const compilePattern = memoize((pattern: string): RegExp => new RegExp(pattern, "i"));

/**
 * The first rule (in file order — earlier entries win) whose pattern
 * matches the game's `shortDescription`, or `undefined` if none do. Pure
 * — no I/O — so it's the part covered by tests. Mirrors
 * `matchDescriptionCategoryRule` exactly, just scoped to `GameCategoryLabel`.
 */
export function matchDescriptionGameCategoryRule(
  shortDescription: string,
  rules: DescriptionGameCategoryRuleEntry[],
): GameCategoryLabel | undefined {
  for (const rule of rules) {
    if (compilePattern(rule.pattern).test(shortDescription)) return rule.category;
  }
  return undefined;
}
