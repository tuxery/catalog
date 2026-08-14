import { groupPackages, type MatchedApp } from "@tuxery/matcher";
import { searchAllSources } from "@tuxery/sources";

export interface Dataset {
  generatedAt: string;
  apps: MatchedApp[];
}

/**
 * Runs the sources + matcher pipeline end to end. Flathub, Snapcraft,
 * AppImage, and AUR all read real cached data (see `@tuxery/sources`);
 * GitHub Releases, Debian, and Fedora aren't wired in yet — see
 * docs/sources.md in tuxery/catalog for status per source.
 */
export async function buildDataset(): Promise<Dataset> {
  const packages = await searchAllSources("");
  const apps = groupPackages(packages);

  return { generatedAt: new Date().toISOString(), apps };
}
