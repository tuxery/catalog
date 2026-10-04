import { enrichApps, filterPackages, groupPackages, type CatalogApp } from "../curator";
import type { LlmClassificationEntry } from "../curator/enrich/llm-classifications";
import { searchAllSources } from "../sources";

export interface Dataset {
  generatedAt: string;
  apps: CatalogApp[];
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
 * enrich each group into a display-ready `CatalogApp` -> drop the ones
 * the LLM marked `excluded`, so the published dataset (and the site) only
 * ever holds apps and games. Every source reads real cached data (see the
 * sources module) — see docs/sources.md in tuxery/catalog for status per
 * source.
 */
export async function buildDataset(options: BuildDatasetOptions = {}): Promise<Dataset> {
  const packages = await searchAllSources("");
  const candidates = filterPackages(packages);
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
  const apps = options.includeExcluded ? enriched : enriched.filter((app) => !app.excluded);

  return { generatedAt: new Date().toISOString(), apps };
}
