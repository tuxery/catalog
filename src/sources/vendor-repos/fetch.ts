import { join } from "node:path";
import { compareDebVersions } from "../_shared/deb-version";
import { parseDeb822 } from "../_shared/deb822";
import { fetchText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { readNdjson, writeNdjson } from "../_shared/ndjson";
import type { VendorRepoCacheEntry, VendorRepoFetchMetadata, VendorRepoSeedEntry } from "./types";

// Brave, Chrome, VS Code, Edge, Signal... ship through their own
// first-party apt repos instead of any distro's archive, so none of the
// distro connectors can see them (the motivating case: Brave Origin showed
// only AUR + Nixpkgs). There's no index of vendor repos to crawl, so this
// reads a short, hand-vetted list (`vendors.ndjson`) and pulls each
// listed package's stanza out of the vendor's own `Packages` file: plain
// GETs of public indexes, the same requests `apt update` makes, one per
// distinct index (about a dozen in total).
//
// amd64 deb indexes only: the rpm/zypper repos carry the same products, so
// a second format would add requests but no extra apps.
const SEED_PATH = join(import.meta.dirname, "vendors.ndjson");

export function loadSeed(): VendorRepoSeedEntry[] {
  return readNdjson<VendorRepoSeedEntry>(SEED_PATH);
}

/**
 * The newest stanza of `packageName` in a `Packages` file, or undefined if
 * the index doesn't carry it. Vendors keep their history in the index, and
 * their order isn't guaranteed, so versions are compared the Debian way
 * (`~` pre-releases below the release). Pure — no I/O.
 */
export function pickLatest(
  text: string,
  packageName: string,
): { description: string; version: string } | undefined {
  const versions = parseDeb822(text).filter((fields) => fields.Package === packageName);
  const latest = versions.reduce<Record<string, string> | undefined>(
    (best, fields) =>
      !best || compareDebVersions(fields.Version ?? "", best.Version ?? "") > 0 ? fields : best,
    undefined,
  );
  if (!latest?.Version) return undefined;
  return { description: latest.Description ?? "", version: latest.Version };
}

/**
 * Reads every seeded package's current version and description from its
 * vendor index and writes them to `cachePath` as NDJSON. One vendor being
 * down or dropping a package must not wipe the others, nor lose its own
 * entry for a week: it keeps the row from the previous cache, with a
 * warning. Only a first run with nothing to fall back on throws.
 */
export async function fetchVendorRepos(cachePath: string): Promise<number> {
  const previous = new Map(
    readNdjson<VendorRepoCacheEntry>(cachePath).map((entry) => [entry.package, entry]),
  );
  const seeds = loadSeed();
  // Each distinct index once, in parallel; a failure is kept as the value so
  // it only affects the entries that read from that index.
  const urls = [...new Set(seeds.map((seed) => seed.indexUrl))];
  const indexes = new Map(
    await Promise.all(
      urls.map(
        async (url) =>
          [
            url,
            await fetchText(url, `vendor index ${url}`).catch((error: Error) => error),
          ] as const,
      ),
    ),
  );

  const entries = seeds.map((seed): VendorRepoCacheEntry => {
    const index = indexes.get(seed.indexUrl);
    const found = typeof index === "string" ? pickLatest(index, seed.package) : undefined;
    if (found) {
      return Object.assign({}, seed, found, {
        description: found.description || seed.description || "",
      });
    }

    const reason =
      index instanceof Error ? index.message : `package ${seed.package} not in the index`;
    const fallback = previous.get(seed.package);
    console.warn(
      `vendor-repos: ${seed.name}: ${reason}${fallback ? " — keeping the previous entry" : ""}`,
    );
    if (!fallback) throw new Error(`vendor-repos: ${seed.name}: ${reason}`);
    return Object.assign({}, seed, {
      description: fallback.description,
      version: fallback.version,
    });
  });

  writeNdjson(cachePath, entries);
  writeMetadata<VendorRepoFetchMetadata>(cachePath, {
    source: "vendor-repos",
    fetchedAt: new Date().toISOString(),
    url: "hand-curated list of vendor apt indexes (src/sources/vendor-repos/vendors.ndjson)",
    entryCount: entries.length,
  });

  return entries.length;
}
