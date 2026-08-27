import { enrichApps, filterPackages, groupPackages, type CatalogApp } from "../curator";
import { searchAllSources } from "../sources";

export interface Dataset {
  generatedAt: string;
  apps: CatalogApp[];
}

/**
 * Runs the sources + curator pipeline end to end: fetch (cached) ->
 * filter out non-app/game packages -> group the rest into unified apps ->
 * enrich each group into a display-ready `CatalogApp`. Every source
 * reads real cached data (see the sources module) — see docs/sources.md
 * in tuxery/catalog for status per source.
 */
export async function buildDataset(): Promise<Dataset> {
  const packages = await searchAllSources("");
  const candidates = filterPackages(packages);
  const matched = groupPackages(candidates);
  const apps = enrichApps(matched);

  return { generatedAt: new Date().toISOString(), apps };
}
