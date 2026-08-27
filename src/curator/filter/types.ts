import { z } from "zod";

const FilterOverrideEntrySchema = z.object({
  sources: z
    .array(z.string())
    .min(1)
    .describe(
      'PackageSourceId values (<format>-<provider>, e.g. "deb-debian") this exact name has actually been checked on — not a wildcard across every source, since the same name can mean something else entirely elsewhere.',
    ),
  name: z.string().describe("The exact SourcedPackage.name on every listed source."),
  reason: z
    .string()
    .describe(
      "Why this entry exists — required so the exception is auditable later, not just an unexplained line.",
    ),
});

/**
 * One hand-curated exception to `looksLikeSupportPackage`'s auto rules —
 * either forcing a package to stay in the catalog despite matching a
 * noise pattern (`config/filter-keep.json`), or forcing one out despite
 * not matching any (`config/filter-exclude.json`). Same shape for both;
 * only the top-level schema description differs (see
 * `FilterKeepListSchema`/`FilterExcludeListSchema` below) — see
 * `_shared/generate-schemas.ts` for how those turn into the checked-in
 * `.schema.json` files `.vscode/settings.json` points editors at.
 */
export type FilterOverrideEntry = z.infer<typeof FilterOverrideEntrySchema>;

export const FilterKeepListSchema = z.array(FilterOverrideEntrySchema).meta({
  title: "Filter: keep list",
  description:
    "Packages filter/rules.ts's auto rules would exclude but shouldn't be — rescues a real app/game from a noise pattern that's right in general but wrong for this specific name. Litmus test: would a user launch this on its own?",
});

export const FilterExcludeListSchema = z.array(FilterOverrideEntrySchema).meta({
  title: "Filter: exclude list",
  description:
    "Packages filter/rules.ts's auto rules miss but shouldn't be in the catalog — force-excludes a real library/support package that happens not to match any noise pattern.",
});
