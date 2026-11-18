import { fileURLToPath } from "node:url";
import { z } from "zod";
import { readJson } from "../_shared/json";
import {
  APP_CATEGORY_LABEL_VALUES,
  GAME_CATEGORY_LABEL_VALUES,
  CONTENT_TYPE_VALUES,
  type ContentType,
} from "./category";
import { cachePerPattern } from "./glob-match";

const CATEGORY_REFINEMENTS_PATH = fileURLToPath(
  new URL("../../../config/category-refinements.json", import.meta.url),
);

const AnyCategoryLabelSchema = z.enum([
  ...APP_CATEGORY_LABEL_VALUES,
  ...GAME_CATEGORY_LABEL_VALUES,
]);

const CategoryRefinementEntrySchema = z
  .object({
    type: z
      .enum(CONTENT_TYPE_VALUES)
      .describe("Which taxonomy the rule works in: `from` and `to` are both labels of this type."),
    from: z
      .array(AnyCategoryLabelSchema)
      .min(1)
      .describe(
        "The broad categories this rule narrows: it only ever moves an app whose category, after every other signal, is one of these.",
      ),
    to: AnyCategoryLabelSchema.describe("The finer category the app moves to."),
    keys: z
      .array(z.string())
      .optional()
      .describe(
        "freedesktop Main or Additional Categories (on any of the app's packages) that move it too, pattern or not: a file manager's `FileManager` key says what it is even when its description doesn't.",
      ),
    pattern: z
      .string()
      .describe(
        "A JavaScript regular expression source string, matched case-insensitively against the app's display name, its `shortDescription` and, when an LLM verdict applies to it, that verdict's short `reason` (never `longDescription`: incidental phrases in long prose are false positives). Use `\\b` word boundaries.",
      ),
    reason: z
      .string()
      .describe(
        "Why the phrase reliably means the finer category, with what was sampled — so the rule stays auditable.",
      ),
  })
  .superRefine((entry, ctx) => {
    const labels: readonly string[] =
      entry.type === "game" ? GAME_CATEGORY_LABEL_VALUES : APP_CATEGORY_LABEL_VALUES;
    for (const label of [...entry.from, entry.to]) {
      if (!labels.includes(label)) {
        ctx.addIssue({
          code: "custom",
          message: `"${label}" is not a ${entry.type} category`,
        });
      }
    }
  });

export type CategoryRefinementEntry = z.infer<typeof CategoryRefinementEntrySchema>;

export const CategoryRefinementsListSchema = z.array(CategoryRefinementEntrySchema).meta({
  title: "Enrich: category refinements",
  description:
    "Moves an app from a broad category to a finer one when its name, short description or LLM verdict reason names the finer one — run after every other category signal, so it applies whichever signal chose the broad category (a generic freedesktop 'Network' tag, a distro section like Debian's 'net', a name or description rule, an LLM verdict, including one stored under a legacy label). First matching rule wins, in file order. See docs/categories.md.",
});

/** Loads the category refinements (`config/category-refinements.json`, missing file reads as empty). */
export function loadCategoryRefinements(): CategoryRefinementEntry[] {
  return readJson(CATEGORY_REFINEMENTS_PATH, CategoryRefinementsListSchema);
}

const compilePattern = cachePerPattern((pattern: string): RegExp => new RegExp(pattern, "i"));

/** What a refinement reads about an app. */
export interface RefinementText {
  name: string;
  shortDescription: string;
  /** The applied LLM verdict's own reason, when one applies. */
  llmReason?: string;
  /** Every freedesktop category key the app's packages carry, for rules with `keys`. */
  keys?: readonly string[];
}

/**
 * The finer category the first matching rule gives an app of `type` now
 * in `category`, or `category` itself when no rule matches. One pass, no
 * chaining: a rule's `to` is never re-refined. Pure — no I/O.
 */
export function refineCategory(
  type: ContentType,
  category: string,
  text: RefinementText,
  rules: CategoryRefinementEntry[],
): string {
  const haystack = [text.name, text.shortDescription, text.llmReason ?? ""].join(" | ");
  for (const rule of rules) {
    if (rule.type !== type || !(rule.from as string[]).includes(category)) continue;
    if (rule.keys?.some((key) => text.keys?.includes(key))) return rule.to;
    if (compilePattern(rule.pattern).test(haystack)) return rule.to;
  }
  return category;
}
