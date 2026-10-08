import { z } from "zod";

/** What a companion adds to its product — see docs/product-families.md. */
export type CompanionKind =
  | "extension"
  | "plugin"
  | "theme"
  | "localization"
  | "data"
  | "native-host"
  | "config";

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
