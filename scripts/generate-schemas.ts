import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { FilterExcludeListSchema, FilterKeepListSchema } from "../src/curator/filter/types";
import { MatchDenyListSchema, MatchForceListSchema } from "../src/curator/match/types";
import { AppStoreTagsListSchema } from "../src/curator/enrich/app-store-frontend";
import { CategoriesAppsSchema, CategoriesGamesSchema } from "../src/curator/enrich/category";
import { CategoryRulesListSchema } from "../src/curator/enrich/category-rules";
import { GameCategoryRulesListSchema } from "../src/curator/enrich/game-category-rules";
import { DescriptionCategoryRulesListSchema } from "../src/curator/enrich/description-category-rules";
import { CompatWarningsListSchema } from "../src/curator/enrich/compat-warnings";
import { EnrichSuitesListSchema } from "../src/curator/enrich/suite";
import { LlmClassificationsListSchema } from "../src/curator/enrich/llm-classifications";

/**
 * Regenerates every `config/*.json` file's checked-in `.schema.json`
 * twin from the Zod schema that already validates it at load time (see
 * `_shared/json.ts`'s `readJson`) — one source of truth for the TS
 * type, the runtime check, and the editor-facing JSON Schema, instead
 * of three things to keep in sync by hand. Colocated with the code that
 * defines each schema, not under `config/` — a JSON Schema is a typing
 * artifact, not tunable data, so it doesn't belong in the folder meant
 * to be edited without touching any TypeScript (see
 * `config/README.md`). Run by hand after changing a schema; the output
 * is committed, since `.vscode/settings.json` needs a real file on disk
 * to point editors at, not a build step contributors must run first.
 */
const SCHEMAS: { schema: z.ZodType; outFile: string }[] = [
  { schema: FilterKeepListSchema, outFile: "../src/curator/filter/filter-keep.schema.json" },
  {
    schema: FilterExcludeListSchema,
    outFile: "../src/curator/filter/filter-exclude.schema.json",
  },
  { schema: MatchForceListSchema, outFile: "../src/curator/match/match-force.schema.json" },
  { schema: MatchDenyListSchema, outFile: "../src/curator/match/match-deny.schema.json" },
  {
    schema: AppStoreTagsListSchema,
    outFile: "../src/curator/enrich/enrich-app-store-tags.schema.json",
  },
  {
    schema: CompatWarningsListSchema,
    outFile: "../src/curator/enrich/enrich-compat-warnings.schema.json",
  },
  { schema: EnrichSuitesListSchema, outFile: "../src/curator/enrich/enrich-suites.schema.json" },
  {
    schema: CategoryRulesListSchema,
    outFile: "../src/curator/enrich/category-rules.schema.json",
  },
  {
    schema: GameCategoryRulesListSchema,
    outFile: "../src/curator/enrich/game-category-rules.schema.json",
  },
  {
    schema: DescriptionCategoryRulesListSchema,
    outFile: "../src/curator/enrich/description-category-rules.schema.json",
  },
  { schema: CategoriesAppsSchema, outFile: "../src/curator/enrich/categories-apps.schema.json" },
  { schema: CategoriesGamesSchema, outFile: "../src/curator/enrich/categories-games.schema.json" },
  {
    schema: LlmClassificationsListSchema,
    outFile: "../src/curator/enrich/llm-classifications.schema.json",
  },
];

for (const { schema, outFile } of SCHEMAS) {
  const path = fileURLToPath(new URL(outFile, import.meta.url));
  writeFileSync(path, JSON.stringify(z.toJSONSchema(schema), null, 2) + "\n");
  console.log(`Wrote ${path}`);
}
