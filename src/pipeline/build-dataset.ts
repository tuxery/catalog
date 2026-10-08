import {
  attachFamilies,
  enrichApps,
  filterPackages,
  groupPackages,
  type CatalogApp,
} from "../curator";
import type { LlmClassificationEntry } from "../curator/enrich/llm-classifications";
import { searchAllSources, type SourcedPackage } from "../sources";

export interface Dataset {
  generatedAt: string;
  apps: CatalogApp[];
}

function isAppstreamAddon(pkg: SourcedPackage): boolean {
  const type = pkg.formal?.componentType;
  return type === "addon" || type === "localization";
}

export interface BuildDatasetOptions {
  /**
   * Overrides `config/llm-classifications.json` — `[]` gives the purely
   * deterministic result (what `classify-llm` queues and audits against).
   */
  llmClassifications?: LlmClassificationEntry[];
  /** Keeps apps a high-confidence LLM verdict marked `excluded` (libraries, other non-apps). */
  includeExcluded?: boolean;
}

/**
 * Runs the sources + curator pipeline end to end: fetch (cached) ->
 * filter out non-app/game packages -> group the rest into unified apps ->
 * enrich each group into a display-ready `CatalogApp` -> attach
 * companions and relations (docs/product-families.md) -> drop the ones
 * the LLM marked `excluded` and the companions, so the published dataset
 * (and the site) only ever holds apps and games. Every source reads real cached data (see the
 * sources module) — see docs/sources.md in tuxery/catalog for status per
 * source.
 */
export async function buildDataset(options: BuildDatasetOptions = {}): Promise<Dataset> {
  const all = await searchAllSources("");
  // AppStream add-ons never stand as apps: they only join the product
  // they extend, as companions (see attachFamilies).
  const addons = all.filter(isAppstreamAddon);
  const packages = all.filter((pkg) => !isAppstreamAddon(pkg));
  const candidates = filterPackages(packages);
  const kept = new Set(candidates);
  const filteredOut = packages.filter((pkg) => !kept.has(pkg));
  const matched = groupPackages(candidates);
  const enriched = enrichApps(
    matched,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.llmClassifications,
  );
  const families = attachFamilies(enriched, [...addons, ...filteredOut]);
  const apps = options.includeExcluded
    ? families
    : families.filter((app) => !app.excluded && !app.companionOf);

  return { generatedAt: new Date().toISOString(), apps };
}
