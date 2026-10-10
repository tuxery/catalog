import { z } from "zod";

/** What a companion adds to its product — see docs/product-families.md. */
const COMPANION_KINDS = [
  "extension",
  "plugin",
  "theme",
  "localization",
  "data",
  "native-host",
  "config",
  "component",
] as const;

/**
 * What a companion adds to its product — see docs/product-families.md.
 * `component` is a separately packaged part of the product itself (its
 * `-data`, `-server` or `-cli` package): listed with the companions, since
 * nobody installs it on its own.
 */
export type CompanionKind = (typeof COMPANION_KINDS)[number];

/** One companion listed on its product's page — never a card of its own. */
export interface Companion {
  name: string;
  kind: CompanionKind;
  /** The companion's own one-liner, shortened for a list row. */
  description: string;
  /** Every source that ships it, each with its package name there. */
  packages: { source: string; name: string }[];
}

const RELATION_TYPES = ["forkOf", "replaces", "wrapperOf", "partOf", "toolFor"] as const;

/** How two products are tied — see docs/product-families.md. */
export type RelationType = (typeof RELATION_TYPES)[number];

/**
 * One edge, stored on both products: `outgoing` on the one the type
 * describes (LibreWolf `forkOf` Firefox), `incoming` on the other
 * (Firefox, forked by LibreWolf).
 */
export interface Relation {
  type: RelationType;
  direction: "outgoing" | "incoming";
  app: { id: string; name: string };
  /** `formal` when a source declares it (AppStream `<replaces>`), `curated` from `config/family-relations.json`. */
  origin: "formal" | "curated";
}

const PackageRefSchema = z.object({
  source: z.string().describe('A PackageSourceId, e.g. "flatpak-flathub".'),
  appId: z.string().describe("SourcedPackage.appId on that source."),
});

const RelationEntrySchema = z.object({
  type: z.enum(RELATION_TYPES).describe("How `from` relates to `to`, read as `from <type> to`."),
  from: PackageRefSchema.describe("A package of the product the relation starts from."),
  to: PackageRefSchema.describe("A package of the product it points to."),
  reason: z.string().describe("The evidence behind this relation — auditable later."),
});

/** One hand-curated relation between two products (`config/family-relations.json`). */
export type RelationEntry = z.infer<typeof RelationEntrySchema>;

export const FamilyRelationsListSchema = z.array(RelationEntrySchema).meta({
  title: "Family: relations between products",
  description:
    "Forks, successors, unofficial wrappers, suite components and companion tools between two products, each identified by one of its packages — see docs/product-families.md.",
});

const CompanionEntrySchema = z.object({
  parent: PackageRefSchema.describe("A package of the product the companion belongs to."),
  companion: PackageRefSchema.describe(
    "A package of the companion's group; the whole group is listed on the parent.",
  ),
  kind: z.enum(COMPANION_KINDS),
  reason: z.string().describe("The evidence — a review verdict, a description, ..."),
});

/** One hand-curated companion (`config/family-companions.json`). */
export type CompanionEntry = z.infer<typeof CompanionEntrySchema>;

export const FamilyCompanionsListSchema = z.array(CompanionEntrySchema).meta({
  title: "Family: curated companions",
  description:
    "Groups listed on another product's page as its companion or component, when no name or metadata signal says so (audacious-plugins-exotic, syncthing-relay) — applied before the automatic signals. See docs/product-families.md.",
});
