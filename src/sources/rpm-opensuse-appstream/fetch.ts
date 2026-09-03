import { fetchGunzippedText, fetchText } from "../_shared/http";
import { parseAppstreamXml, type AppstreamComponent } from "../_shared/appstream";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { OpenSuseAppstreamCacheEntry, OpenSuseAppstreamFetchMetadata } from "./types";

// Same two repos as rpm-opensuse: oss (free) and non-oss (proprietary).
const REPOS = [
  { id: "oss", base: "https://download.opensuse.org/tumbleweed/repo/oss" },
  { id: "non-oss", base: "https://download.opensuse.org/tumbleweed/repo/non-oss" },
] as const;

/**
 * Fetches an openSUSE repo's `appdata.xml.gz` via the `appdata` data type
 * from its `repomd.xml`. openSUSE's AppStream data is a standard AppStream
 * file keyed by `<pkgname>` (the binary package name), letting it bridge to
 * the rpm-opensuse connector by exact `appId` match.
 */
async function fetchAppdata(repo: (typeof REPOS)[number]): Promise<AppstreamComponent[]> {
  const repomdXml = await fetchText(
    `${repo.base}/repodata/repomd.xml`,
    `openSUSE ${repo.id} repomd.xml`,
  );
  const appdataLocation = repomdXml.match(
    /<data type="appdata">[\s\S]*?<location href="([^"]+)"/,
  )?.[1];
  if (!appdataLocation) {
    throw new Error(`openSUSE ${repo.id} repomd.xml has no appdata data location`);
  }
  const xml = await fetchGunzippedText(
    `${repo.base}/${appdataLocation}`,
    `openSUSE ${repo.id} appdata.xml.gz`,
  );
  return parseAppstreamXml(xml);
}

/**
 * Turns a generic AppStream component into the openSUSE-specific cache row
 * shape. Keeps only components with a binary package name (`pkgname`),
 * because that's the join key to the rpm-opensuse source.
 */
export function toCacheEntries(
  components: AppstreamComponent[],
  repo: OpenSuseAppstreamCacheEntry["repo"],
): OpenSuseAppstreamCacheEntry[] {
  return components
    .filter((component) => component.pkgname)
    .map((component) => ({
      id: component.id,
      repo,
      pkgname: component.pkgname as string,
      source_pkgname: component.source_pkgname,
      name: component.name,
      summary: component.summary,
      version: component.version,
      iconFilename: component.iconFilename,
      remoteIconUrl: component.remoteIconUrl,
      homepage: component.homepage,
      hasGameCategory: component.hasGameCategory,
      categories: component.categories,
      license: component.license,
      developer: component.developer,
      longDescription: component.longDescription,
      screenshots: component.screenshots,
      languages: component.languages,
      changelog: component.changelog,
      lastUpdated: component.lastUpdated,
    }));
}

/**
 * Downloads openSUSE Tumbleweed's AppStream appdata from oss + non-oss,
 * writes one NDJSON cache per repo, and writes metadata for the whole
 * connector. Components are tagged with which repo they came from.
 */
export async function fetchOpenSuseAppstream(cachePath: string): Promise<number> {
  const repoEntries = await Promise.all(
    REPOS.map(async (repo) => {
      const components = await fetchAppdata(repo);
      return toCacheEntries(components, repo.id);
    }),
  );
  const entries = repoEntries.flat();

  writeNdjson(cachePath, entries);
  writeMetadata<OpenSuseAppstreamFetchMetadata>(cachePath, {
    source: "rpm-opensuse-appstream",
    fetchedAt: new Date().toISOString(),
    url: REPOS.map((repo) => repo.base).join(", "),
    entryCount: entries.length,
    reposFetched: REPOS.map((repo) => repo.id),
  });

  return entries.length;
}
