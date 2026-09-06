import { fileURLToPath } from "node:url";
import { memoize } from "helpers4/function";
import { z } from "zod";
import { readJson } from "../_shared/json";
import { AppCategoryLabelSchema, type AppCategoryLabel } from "./category";

const DESCRIPTION_CATEGORY_RULES_PATH = fileURLToPath(
  new URL("../../../config/description-category-rules.json", import.meta.url),
);

const DescriptionCategoryRuleEntrySchema = z.object({
  pattern: z
    .string()
    .describe(
      'A JavaScript regular expression source string, matched case-insensitively against the app\'s own `shortDescription` (never `longDescription` — verified live that longer prose produces real false positives from incidental phrases, e.g. an invoicing app mentioning "save it... from your web browser"). Always a multi-word phrase with `\\b` word boundaries, never a bare generic word — single words like "editor"/"player"/"manager" mean different things in different categories.',
    ),
  category: AppCategoryLabelSchema.describe(
    "One of config/categories-apps.json's own display labels — this is the last-resort signal for apps with no upstream category, no category-rules.json name match, and no Debian/Gentoo/openSUSE section match either.",
  ),
  reason: z
    .string()
    .describe(
      "Why this phrase reliably predicts this category — required so the rule is auditable later, not just an unexplained line.",
    ),
});

export type DescriptionCategoryRuleEntry = z.infer<typeof DescriptionCategoryRuleEntrySchema>;

export const DescriptionCategoryRulesListSchema = z.array(DescriptionCategoryRuleEntrySchema).meta({
  title: "Enrich: description category rules",
  description:
    'Hand-curated keyword-phrase → category rules matched against an app\'s own shortDescription, for apps with no upstream category, no category-rules.json name match, and no distro-Section match either — the last resort before "To Classify". First matching rule wins, checked in order (a few entries are deliberately ordered first as priority overrides for a phrase that means two different things, e.g. "task manager" the to-do app vs. "task manager" the Windows-style process monitor — see those entries\' own reasons). Every entry was verified live against a real sample of matches before being added, same discipline as category-rules.json, just against description text instead of package names — richer signal, less precise, so kept as the last resort in the fallback chain.',
});

/** Loads the hand-curated description-category-rules list (`config/description-category-rules.json`, missing file reads as empty). */
export function loadDescriptionCategoryRules(): DescriptionCategoryRuleEntry[] {
  return readJson(DESCRIPTION_CATEGORY_RULES_PATH, DescriptionCategoryRulesListSchema);
}

// Same "compile once, reuse across every app" reasoning as
// category-rules.ts/game-category-rules.ts's globToRegExp — this runs
// once per still-unclassified app across the whole catalog (tens of
// thousands of calls) against the same fixed 137-entry rule list, so
// recompiling every pattern's RegExp on every call would be pure waste.
const compilePattern = memoize((pattern: string): RegExp => new RegExp(pattern, "i"));

/**
 * The first rule (in file order — earlier entries win) whose pattern
 * matches the app's `shortDescription`, or `undefined` if none do. Pure —
 * no I/O — so it's the part covered by tests. Patterns are raw regex
 * source (unlike category-rules.ts's simple glob dialect), so they're
 * compiled directly rather than through a glob-to-regex translation.
 */
export function matchDescriptionCategoryRule(
  shortDescription: string,
  rules: DescriptionCategoryRuleEntry[],
): AppCategoryLabel | undefined {
  for (const rule of rules) {
    if (compilePattern(rule.pattern).test(shortDescription)) return rule.category;
  }
  return undefined;
}
