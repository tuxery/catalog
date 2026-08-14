import { filterPackages, groupPackages, type MatchedApp } from "@tuxery/curator";
import { searchAllSources } from "@tuxery/sources";

export interface Dataset {
  generatedAt: string;
  apps: MatchedApp[];
}

/**
 * Runs the sources + curator pipeline end to end: fetch (cached) ->
 * filter out non-app/game packages -> group the rest into unified apps.
 * Every source except GitHub Releases reads real cached data (see
 * `@tuxery/sources`) — see docs/sources.md in tuxery/catalog for status
 * per source.
 */
export async function buildDataset(): Promise<Dataset> {
  const packages = await searchAllSources("");
  const candidates = filterPackages(packages);
  const apps = groupPackages(candidates);

  return { generatedAt: new Date().toISOString(), apps };
}
