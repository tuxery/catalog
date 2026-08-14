import { groupPackages, type MatchedApp } from "@tuxery/matcher";
import { searchAllSources } from "@tuxery/sources";

export interface Dataset {
  generatedAt: string;
  apps: MatchedApp[];
}

/**
 * Runs the sources + matcher pipeline end to end. Flathub reads real cached
 * data (see `@tuxery/sources`); Snapcraft and AppImage still read an empty
 * cache, so every app currently groups to a single Flathub package.
 */
export async function buildDataset(): Promise<Dataset> {
  const packages = await searchAllSources("");
  const apps = groupPackages(packages);

  return { generatedAt: new Date().toISOString(), apps };
}
