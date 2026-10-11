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

const MatchApartEntrySchema = z.object({
  a: z.array(MatchPackageRefSchema).min(1).describe("The packages of one product."),
  b: z
    .array(MatchPackageRefSchema)
    .min(1)
    .describe("The packages of the other product, sharing a name or appId with the first."),
  reason: z
    .string()
    .describe("Which two products these are — required so the exception is auditable later."),
});

/**
 * Two products that share a name or a bare appId and must stay apart
 * (`config/match-apart.json`): no auto tier may put a package of `a` and a
 * package of `b` in one group, through whatever chain of other packages.
 * Unlike `match-deny.json`'s pairs, one entry covers every edge — list the
 * packages whose name or appId collides, on both sides.
 */
export type MatchApartEntry = z.infer<typeof MatchApartEntrySchema>;

export const MatchApartListSchema = z.array(MatchApartEntrySchema).meta({
  title: "Match: products kept apart",
  description:
    "Homonyms (KDE's Dolphin and the Dolphin emulator, the Tesseract OCR engine and the Tesseract shooter) that match/group.ts's tiers would merge on a shared name or appId: no group may hold a package of both sides.",
});

export const MatchForceListSchema = z.array(ForceMatchEntrySchema).meta({
  title: "Match: force-merge list",
  description:
    "Pairs (or groups) too ambiguous for match/group.ts's auto tiers — forces every listed source package to merge into the same CatalogApp as destination, regardless of score.",
});

const MatchTrackEntrySchema = z.object({
  product: z
    .string()
    .describe(
      'A package name already in the product\'s group, as the build-suffix-stripped name match/group.ts keys on (e.g. "firefox").',
    ),
  track: z
    .string()
    .describe('The track these packages are, e.g. "esr" — see docs/product-families.md.'),
  names: z
    .array(z.string())
    .min(1)
    .describe(
      'Build-suffix-stripped package names that are this track of the product, on any source (e.g. "firefox-esr" also covers "firefox-esr-bin").',
    ),
  reason: z
    .string()
    .describe("Why these packages are a parallel line of the product — auditable later."),
});

/** One hand-curated track of a product (`config/match-tracks.json`). */
export type MatchTrackEntry = z.infer<typeof MatchTrackEntrySchema>;

export const MatchTracksListSchema = z.array(MatchTrackEntrySchema).meta({
  title: "Match: product tracks",
  description:
    "Parallel lines of a product (Firefox ESR, LibreOffice Still, ...) — merges every listed package into the product's group and labels it with the track. See docs/product-families.md.",
});
