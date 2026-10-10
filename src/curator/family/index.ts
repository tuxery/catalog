import type { SourcedPackage } from "../../sources";
import type { CatalogApp } from "../enrich/types";
import {
  buildProductIndex,
  capCompanions,
  companionOf,
  mergeCompanions,
  toCompanion,
  type CompanionMatch,
} from "./companions";
import {
  collectEdges,
  loadFamilyCompanions,
  loadFamilyRelations,
  relationsByApp,
} from "./relations";
import type { Companion, CompanionEntry, RelationEntry } from "./types";

export type { Companion, CompanionKind, Relation, RelationType } from "./types";
export { loadFamilyRelations } from "./relations";

/** Whether a package is an app in AppStream's own terms — a group holding one stays a product. */
function isAppstreamApp(pkg: SourcedPackage): boolean {
  const type = pkg.formal?.componentType;
  return type === "desktop-application" || type === "console-application";
}

/**
 * The product-families stage after enrich (docs/product-families.md):
 *
 * - a group whose own name says it's a companion of another product
 *   (`chromium-extension-dark-reader`) becomes that product's companion —
 *   `companionOf` set, listed in the product's `companions`, left out of
 *   the published dataset like `excluded`;
 * - `loose` packages that never formed a group — filtered out as
 *   non-apps, or AppStream add-ons — join their product's `companions`
 *   when a signal names it, and are dropped otherwise;
 * - curated and declared relations link the remaining products, both
 *   ways.
 *
 * Pure — returns new app objects.
 */
export function attachFamilies(
  apps: readonly CatalogApp[],
  loose: readonly SourcedPackage[],
  curatedRelations: readonly RelationEntry[] = loadFamilyRelations(),
  curatedCompanions: readonly CompanionEntry[] = loadFamilyCompanions(),
): CatalogApp[] {
  const index = buildProductIndex(apps);

  // Curated companions first (config/family-companions.json): they win
  // over every automatic signal, AppStream apps included.
  const groupMatches = new Map<string, CompanionMatch>();
  const byPackage = new Map<string, CatalogApp>();
  for (const app of apps) {
    for (const pkg of app.packages) byPackage.set(`${pkg.source}:${pkg.appId ?? pkg.name}`, app);
  }
  for (const entry of curatedCompanions) {
    const parent = byPackage.get(`${entry.parent.source}:${entry.parent.appId}`);
    const companion = byPackage.get(`${entry.companion.source}:${entry.companion.appId}`);
    if (parent && companion && parent !== companion) {
      groupMatches.set(companion.id, { parent, kind: entry.kind });
    }
  }

  for (const app of apps) {
    if (groupMatches.has(app.id) || app.packages.some(isAppstreamApp)) continue;
    for (const pkg of app.packages) {
      const match = companionOf(pkg, index, { standalone: true });
      if (match && match.parent !== app) {
        groupMatches.set(app.id, match);
        break;
      }
    }
  }
  // One level only: a companion of a companion isn't attached anywhere.
  for (const [id, match] of groupMatches) {
    if (groupMatches.has(match.parent.id)) groupMatches.delete(id);
  }

  const companions = new Map<string, Companion[]>();
  const add = (parentId: string, companion: Companion) => {
    const list = companions.get(parentId) ?? [];
    list.push(companion);
    companions.set(parentId, list);
  };
  for (const app of apps) {
    const match = groupMatches.get(app.id);
    if (match)
      add(match.parent.id, toCompanion(app.name, match.kind, app.shortDescription, app.packages));
  }
  for (const pkg of loose) {
    const match = companionOf(pkg, index, { standalone: false });
    if (match && !groupMatches.has(match.parent.id)) {
      add(match.parent.id, toCompanion(pkg.name, match.kind, pkg.description, [pkg]));
    }
  }

  const products = apps.filter((app) => !groupMatches.has(app.id) && !app.excluded);
  const relations = relationsByApp(collectEdges(products, curatedRelations));

  return apps.map((app) => {
    const match = groupMatches.get(app.id);
    const own = companions.get(app.id);
    const capped = own ? capCompanions(mergeCompanions(own)) : undefined;
    const related = relations.get(app.id);
    return {
      ...app,
      ...(match ? { companionOf: match.parent.id } : {}),
      ...(capped ? { companions: capped.companions, companionCounts: capped.counts } : {}),
      ...(related ? { relations: related } : {}),
    };
  });
}
