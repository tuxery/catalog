import { fileURLToPath } from "node:url";
import { memoize } from "@helpers4/function";
import { z } from "zod";
import { readJson } from "../_shared/json";
import { AppCategoryLabelSchema, type AppCategoryLabel } from "./category";

const CATEGORY_RULES_PATH = fileURLToPath(
  new URL("../../../config/category-rules.json", import.meta.url),
);

const CategoryRuleEntrySchema = z.object({
  pattern: z
    .string()
    .describe(
      'A simple glob matched case-insensitively against every package name in the app\'s group (not just its display name) — "*" means "any characters", everything else is literal. E.g. "proton*" matches "proton", "ProtonPlus", and "proton-cachyos-native" alike.',
    ),
  category: AppCategoryLabelSchema.describe(
    "One of config/categories-apps.json's own display labels (not a freedesktop key) — this is a last-resort signal for apps with no upstream category at all, so it writes the label directly. Never a categories-games.json genre — see category-rules.ts's doc comment on why games skip this fallback entirely.",
  ),
  reason: z
    .string()
    .describe(
      "Why this family belongs in this category — required so the rule is auditable later, not just an unexplained line.",
    ),
});

export type CategoryRuleEntry = z.infer<typeof CategoryRuleEntrySchema>;

export const CategoryRulesListSchema = z.array(CategoryRuleEntrySchema).meta({
  title: "Enrich: category rules",
  description:
    'Hand-curated name-pattern → category rules for apps with no upstream category signal at all (no Flathub/AppCenter/Snapcraft category, so pickCategory would otherwise fall straight to "To Classify") — first matching rule wins, checked in order. The simple, no-TypeScript-required way to teach the catalog a well-known product family (e.g. Wine/Proton compatibility tools) it has no other way to classify.',
});

/** Loads the hand-curated category-rules list (`config/category-rules.json`, missing file reads as empty). */
export function loadCategoryRules(): CategoryRuleEntry[] {
  return readJson(CATEGORY_RULES_PATH, CategoryRulesListSchema);
}

// Compiling a pattern is the expensive part (relative to the match test
// itself), and `matchCategoryRule` runs once per uncategorized app across
// the whole catalog (tens of thousands of calls) against the same fixed
// rule list every time — recompiling every pattern's RegExp on every call
// would mean millions of redundant compilations for a set of patterns
// that never changes at runtime. `@helpers4/function`'s `memoize` caches
// by (JSON-stringified) argument, i.e. by pattern string here, so two
// different rules that happen to share a pattern string (none do today,
// but nothing stops it) still share one compile.
const globToRegExp = memoize((pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
});

/**
 * The first rule (in file order — earlier entries win, same "more specific
 * before generic catch-all" convention as `config/categories-apps.json`'s
 * own key order) whose pattern matches any of an app's member package
 * names, or `undefined` if none do. Pure — no I/O — so it's the part
 * covered by tests.
 */
export function matchCategoryRule(
  names: string[],
  rules: CategoryRuleEntry[],
): AppCategoryLabel | undefined {
  for (const rule of rules) {
    const regExp = globToRegExp(rule.pattern);
    if (names.some((name) => regExp.test(name))) return rule.category;
  }
  return undefined;
}
