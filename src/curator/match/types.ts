import { z } from "zod";

const MatchPackageRefSchema = z.object({
  source: z.string().describe('A PackageSourceId, e.g. "flatpak-flathub".'),
  appId: z.string().describe("SourcedPackage.appId on that source."),
});

/** One side of a manual/deny match entry — identifies a specific package by its source and appId. */
export type MatchPackageRef = z.infer<typeof MatchPackageRefSchema>;

const MatchOverrideEntrySchema = z.object({
  a: MatchPackageRefSchema,
  b: MatchPackageRefSchema,
  reason: z
    .string()
    .describe(
      "Why these look like the same app but genuinely aren't — required so the exception is auditable later, not just an unexplained pair.",
    ),
});

/**
 * One hand-curated deny exception — a pair of packages that must never
 * merge even if the auto tiers would (`config/match-deny.json`).
 * Deliberately pairwise, not destination+sources like `ForceMatchEntry`
 * below: there's no canonical side to a "keep these apart" rule.
 */
export type MatchOverrideEntry = z.infer<typeof MatchOverrideEntrySchema>;

export const MatchDenyListSchema = z.array(MatchOverrideEntrySchema).meta({
  title: "Match: deny-merge list",
  description:
    "Pairs that must never merge even if match/group.ts's auto tiers would — the counterpart to match-force.json. Deliberately pairwise, not destination+sources: there's no canonical side to a \"keep these apart\" rule.",
});

const ForceMatchEntrySchema = z.object({
  destination: MatchPackageRefSchema.describe(
    "The canonical package every entry in sources merges into — usually the Flathub listing, but not required to be.",
  ),
  sources: z
    .array(MatchPackageRefSchema)
    .min(1)
    .describe(
      "Every package that should merge into destination. One entry per source package — list as many as apply to this same destination rather than repeating destination across several top-level entries.",
    ),
  reason: z
    .string()
    .describe(
      "Why the auto tiers can't bridge this on their own — required so the exception is auditable later, not just an unexplained group.",
    ),
});

/**
 * One hand-curated force-merge exception (`config/match-force.json`) —
 * every package in `sources` merges into `destination`, no scoring
 * involved.
 */
export type ForceMatchEntry = z.infer<typeof ForceMatchEntrySchema>;

export const MatchForceListSchema = z.array(ForceMatchEntrySchema).meta({
  title: "Match: force-merge list",
  description:
    "Pairs (or groups) too ambiguous for match/group.ts's auto tiers — forces every listed source package to merge into the same CatalogApp as destination, regardless of score.",
});
