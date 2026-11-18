import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { SourcedPackage } from "../../sources/types";
import {
  APP_CATEGORY_LABEL_VALUES,
  CONTENT_TYPE_VALUES,
  GAME_CATEGORY_LABEL_VALUES,
  type ContentType,
} from "./category";
import { cachedGlobToRegExp, cachePerPattern } from "./glob-match";

const SUBCATEGORIES_PATH = fileURLToPath(
  new URL("../../../config/subcategories.json", import.meta.url),
);

const sectionGlobs = (description: string) =>
  z
    .array(z.string().regex(/^[^:]+:.+$/, "a section is `<source id>:<section>`, globs allowed"))
    .optional()
    .describe(description);

const SubcategoryRuleSchema = z.object({
  subcategory: z
    .string()
    .min(1)
    .regex(/^[^:]+$/, "a subcategory label can't contain ':' (it ends a meta key)")
    .describe("The subcategory label, also its id in `/browse/?category=…&sub=…`."),
  names: z
    .string()
    .optional()
    .describe(
      "Checked first: a regular expression matched case-insensitively against the display name and every package name. For names that say it all (`gcc-14-mips-linux-gnu` is a cross-compiler).",
    ),
  keys: z
    .array(z.string())
    .optional()
    .describe(
      "freedesktop Main or Additional Categories (on any package) that mean this subcategory. Checked second.",
    ),
  sections: sectionGlobs(
    "Distro sections that mean this subcategory, as `<source id>:<section>` globs (`ebuild-gentoo:dev-vcs`, `deb-*:vcs`, `rpm-opensuse:Productivity/Databases/*`). Checked third.",
  ),
  pattern: z
    .string()
    .optional()
    .describe(
      "A JavaScript regular expression source string, matched case-insensitively against the display name, the short description and the LLM verdict's reason (for games also AUR keywords and the start of the long description). Checked fourth, in rule order.",
    ),
  weakKeys: z
    .array(z.string())
    .optional()
    .describe(
      "freedesktop keys too broad to beat the text (`Viewer`, `Office`, `BoardGame`): checked fifth, after every rule's pattern.",
    ),
  weakSections: sectionGlobs(
    "Distro sections too broad to beat the text (`deb-*:x11`, `deb-*:admin`): checked fifth, after every rule's pattern.",
  ),
  fallbackNames: z
    .string()
    .optional()
    .describe(
      "Checked last, when nothing else matched: a regular expression on the display and package names (`python3-*` modules).",
    ),
  fallbackSections: sectionGlobs("Checked last, with `fallbackNames`."),
});

export type SubcategoryRule = z.infer<typeof SubcategoryRuleSchema>;

const CategorySubcategoriesSchema = z
  .object({
    type: z
      .enum(CONTENT_TYPE_VALUES)
      .describe("Whether the category is an app category or a game genre."),
    subcategories: z.array(SubcategoryRuleSchema).min(2),
  })
  .superRefine((entry, ctx) => {
    const seen = new Set<string>();
    for (const rule of entry.subcategories) {
      if (seen.has(rule.subcategory)) {
        ctx.addIssue({ code: "custom", message: `"${rule.subcategory}" is listed twice` });
      }
      seen.add(rule.subcategory);
    }
  });

export const SubcategoriesSchema = z
  .record(z.string(), CategorySubcategoriesSchema)
  .superRefine((record, ctx) => {
    for (const [category, entry] of Object.entries(record)) {
      const labels: readonly string[] =
        entry.type === "game" ? GAME_CATEGORY_LABEL_VALUES : APP_CATEGORY_LABEL_VALUES;
      if (!labels.includes(category)) {
        ctx.addIssue({ code: "custom", message: `"${category}" is not a ${entry.type} category` });
      }
    }
  })
  .meta({
    title: "Enrich: subcategories",
    description:
      "The second level of the category tree: for each category that has one, its subcategories and the signals that file an app there. A category missing here has no subcategories. Within a category the first rule that matches wins, in passes: `names`, then `keys`, then `sections`, then `pattern`, then `weakKeys`/`weakSections`, then `fallbackNames`/`fallbackSections`. An app nothing matches has no subcategory and is listed under its category only. See docs/categories.md.",
  });

export type Subcategories = ReadonlyMap<string, { type: ContentType; rules: SubcategoryRule[] }>;

/** Loads `config/subcategories.json` (missing file reads as no subcategories). */
export function loadSubcategories(): Subcategories {
  const map = new Map<string, { type: ContentType; rules: SubcategoryRule[] }>();
  if (!existsSync(SUBCATEGORIES_PATH)) return map;
  const record = SubcategoriesSchema.parse(JSON.parse(readFileSync(SUBCATEGORIES_PATH, "utf8")));
  for (const [category, entry] of Object.entries(record)) {
    map.set(`${entry.type}:${category}`, { type: entry.type, rules: entry.subcategories });
  }
  return map;
}

/** The subcategory labels of a category, in config order (empty when it has none). */
export function subcategoriesOf(
  subcategories: Subcategories,
  type: ContentType,
  category: string,
): string[] {
  return (subcategories.get(`${type}:${category}`)?.rules ?? []).map((rule) => rule.subcategory);
}

const compilePattern = cachePerPattern((pattern: string): RegExp => new RegExp(pattern, "i"));

/** How much of a game's long description the text pass reads: its opening, where the genre is said. */
const GAME_LONG_DESCRIPTION_CHARS = 600;

/**
 * AUR-style packaging suffixes, dropped from the name the text pass
 * reads: `corange-git` is a game engine built from its git repository,
 * not a git tool.
 */
const PACKAGING_SUFFIX =
  /([-_](git|bin|svn|hg|bzr|nightly|beta|appimage|latest|stable|dev|devel|unstable|prebuilt))+$/i;

/** What the subcategory rules read about an app. */
export interface SubcategoryInput {
  type: ContentType;
  category: string;
  name: string;
  shortDescription: string;
  longDescription?: string;
  /** The applied LLM verdict's own reason, when one applies. */
  llmReason?: string;
  packages: readonly Pick<
    SourcedPackage,
    "source" | "name" | "categories" | "section" | "keywords"
  >[];
}

function matchesSection(
  sections: ReadonlySet<string>,
  globs: readonly string[] | undefined,
): boolean {
  if (!globs || globs.length === 0) return false;
  for (const glob of globs) {
    const regex = cachedGlobToRegExp(glob);
    for (const section of sections) if (regex.test(section)) return true;
  }
  return false;
}

function matchesAny(texts: readonly string[], pattern: string | undefined): boolean {
  if (!pattern) return false;
  const regex = compilePattern(pattern);
  return texts.some((text) => regex.test(text));
}

/**
 * The subcategory of an app already in `input.category`, or `undefined`
 * when the category has none or no rule matches. Pure — no I/O.
 */
export function pickSubcategory(
  input: SubcategoryInput,
  subcategories: Subcategories,
): string | undefined {
  const rules = subcategories.get(`${input.type}:${input.category}`)?.rules;
  if (!rules) return undefined;

  const keys = new Set<string>();
  const sections = new Set<string>();
  const keywords: string[] = [];
  for (const pkg of input.packages) {
    for (const key of pkg.categories ?? []) keys.add(key);
    if (pkg.section) sections.add(`${pkg.source}:${pkg.section}`);
    for (const keyword of pkg.keywords ?? []) keywords.push(keyword);
  }
  const names = [input.name, ...input.packages.map((pkg) => pkg.name)];
  const textParts = [
    input.name.replace(PACKAGING_SUFFIX, ""),
    input.shortDescription,
    input.llmReason ?? "",
  ];
  if (input.type === "game") {
    textParts.push(
      keywords.join(" "),
      (input.longDescription ?? "").slice(0, GAME_LONG_DESCRIPTION_CHARS),
    );
  }
  const text = textParts.join(" | ");
  const hasKey = (list: readonly string[] | undefined) => (list ?? []).some((key) => keys.has(key));

  const passes: ((rule: SubcategoryRule) => boolean)[] = [
    (rule) => matchesAny(names, rule.names),
    (rule) => hasKey(rule.keys),
    (rule) => matchesSection(sections, rule.sections),
    (rule) => matchesAny([text], rule.pattern),
    (rule) => hasKey(rule.weakKeys) || matchesSection(sections, rule.weakSections),
    (rule) =>
      matchesAny(names, rule.fallbackNames) || matchesSection(sections, rule.fallbackSections),
  ];
  for (const pass of passes) {
    const rule = rules.find(pass);
    if (rule) return rule.subcategory;
  }
  return undefined;
}
