import { fileURLToPath } from "node:url";
import { readJson } from "../_shared/json";
import type { CatalogApp } from "../enrich/types";
import {
  FamilyCompanionsListSchema,
  FamilyRelationsListSchema,
  type CompanionEntry,
  type Relation,
  type RelationEntry,
  type RelationType,
} from "./types";

const RELATIONS_PATH = fileURLToPath(
  new URL("../../../config/family-relations.json", import.meta.url),
);

const COMPANIONS_PATH = fileURLToPath(
  new URL("../../../config/family-companions.json", import.meta.url),
);

/** Loads `config/family-companions.json` (missing file reads as empty). */
export function loadFamilyCompanions(): CompanionEntry[] {
  return readJson(COMPANIONS_PATH, FamilyCompanionsListSchema);
}

/** Loads `config/family-relations.json` (missing file reads as empty). */
export function loadFamilyRelations(): RelationEntry[] {
  return readJson(RELATIONS_PATH, FamilyRelationsListSchema);
}

interface Edge {
  type: RelationType;
  from: CatalogApp;
  to: CatalogApp;
  origin: Relation["origin"];
}

/**
 * Every relation between two different products: curated entries
 * resolved through any package of each side, then AppStream `<replaces>`
 * pointing at another product's own AppStream id (a declared successor).
 * Deduplicated by type and both ends, curated first. Pure.
 */
export function collectEdges(
  apps: readonly CatalogApp[],
  curated: readonly RelationEntry[],
): Edge[] {
  const byPackage = new Map<string, CatalogApp>();
  const byAppstreamId = new Map<string, CatalogApp>();
  for (const app of apps) {
    for (const pkg of app.packages) {
      byPackage.set(`${pkg.source}:${pkg.appId ?? pkg.name}`, app);
      if (pkg.formal?.componentType && pkg.appId) byAppstreamId.set(pkg.appId, app);
    }
  }

  const edges: Edge[] = [];
  for (const entry of curated) {
    const from = byPackage.get(`${entry.from.source}:${entry.from.appId}`);
    const to = byPackage.get(`${entry.to.source}:${entry.to.appId}`);
    if (from && to && from !== to) edges.push({ type: entry.type, from, to, origin: "curated" });
  }
  for (const app of apps) {
    for (const pkg of app.packages) {
      for (const id of pkg.formal?.replaces ?? []) {
        const to = byAppstreamId.get(id);
        if (to && to !== app) edges.push({ type: "replaces", from: app, to, origin: "formal" });
      }
    }
  }

  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.type}:${edge.from.id}:${edge.to.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Each product's relations, both directions, keyed by product id. Pure. */
export function relationsByApp(edges: readonly Edge[]): Map<string, Relation[]> {
  const byApp = new Map<string, Relation[]>();
  const add = (app: CatalogApp, relation: Relation) => {
    const list = byApp.get(app.id) ?? [];
    list.push(relation);
    byApp.set(app.id, list);
  };
  for (const edge of edges) {
    add(edge.from, {
      type: edge.type,
      direction: "outgoing",
      app: { id: edge.to.id, name: edge.to.name },
      origin: edge.origin,
    });
    add(edge.to, {
      type: edge.type,
      direction: "incoming",
      app: { id: edge.from.id, name: edge.from.name },
      origin: edge.origin,
    });
  }
  return byApp;
}
