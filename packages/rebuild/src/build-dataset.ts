import { groupPackages, type MatchedApp } from "@tuxery/matcher";
import { searchAllSources } from "@tuxery/sources";

export interface Dataset {
  generatedAt: string;
  apps: MatchedApp[];
}

/**
 * Runs the sources + matcher pipeline end to end. Source connectors are
 * still stubs (see `@tuxery/sources`), so this currently always yields an
 * empty dataset — this function exists to prove the orchestration wiring,
 * not to produce real data yet.
 */
export async function buildDataset(): Promise<Dataset> {
  const packages = await searchAllSources("");
  const apps = groupPackages(packages);

  return { generatedAt: new Date().toISOString(), apps };
}
