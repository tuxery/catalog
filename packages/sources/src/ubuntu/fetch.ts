import { gunzipSync } from "node:zlib";
import { parseDeb822 } from "../_shared/deb822";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { UbuntuCacheEntry, UbuntuFetchMetadata } from "./types";

// Ubuntu publishes one Packages file per suite/component/arch, same deb822
// mechanism as Debian (unsurprising — Ubuntu's archive is a Debian
// derivative) but its own codename-based suites, not "stable" — resolute
// is the current release as of writing, verified via the real archive's
// dists/ listing and each candidate's Release file date, not assumed.
//
// Unlike Debian, "main" alone is badly incomplete here: Ubuntu's
// main/universe split is by *support tier* (Canonical-supported vs.
// community-maintained), not license status like Debian's main/contrib/
// non-free — most desktop apps live in universe. Verified against the
// real archive: main/binary-amd64/Packages.gz alone yielded 6,487
// packages; universe's is ~20MB compressed, clearly the bulk of the
// catalog. restricted (binary/proprietary drivers) and multiverse
// (copyright/legal-restricted software — codecs, some games) round out
// the four components, same spirit as Debian's contrib/non-free.
const SUITE = "resolute";
const COMPONENTS = ["main", "universe", "restricted", "multiverse"] as const;
type UbuntuComponent = (typeof COMPONENTS)[number];
const ARCH = "amd64";

function packagesUrl(component: UbuntuComponent): string {
  return `https://archive.ubuntu.com/ubuntu/dists/${SUITE}/${component}/binary-${ARCH}/Packages.gz`;
}

/**
 * Maps deb822 stanzas (already parsed by `_shared/deb822.ts`) to cache
 * rows, stamping which component they came from (a package belongs to
 * exactly one component within a suite, never both). Pure — no I/O — so
 * it's the part covered by tests.
 */
export function parsePackages(text: string, component: UbuntuComponent): UbuntuCacheEntry[] {
  return parseDeb822(text)
    .filter((fields): fields is typeof fields & { Package: string } => Boolean(fields.Package))
    .map((fields) => ({
      name: fields.Package,
      description: fields.Description ?? "",
      version: fields.Version ?? "unknown",
      homepage: fields.Homepage || undefined,
      component,
      section: fields.Section || undefined,
    }));
}

async function fetchComponent(component: UbuntuComponent): Promise<UbuntuCacheEntry[]> {
  const url = packagesUrl(component);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Ubuntu component "${component}": ${response.status} ${response.statusText}`,
    );
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  const text = gunzipSync(compressed).toString("utf8");
  return parsePackages(text, component);
}

/**
 * Downloads Ubuntu's Packages.gz for main + universe and writes the
 * normalized entries to `cachePath` as NDJSON — each row keeps its source
 * component (see `UbuntuCacheEntry.component`), no cross-component dedup
 * needed since a package name only ever belongs to one. See
 * docs/sources.md.
 */
export async function fetchUbuntu(cachePath: string): Promise<number> {
  const entriesByComponent = await Promise.all(COMPONENTS.map(fetchComponent));
  const entries = entriesByComponent.flat();

  writeNdjson(cachePath, entries);
  writeMetadata<UbuntuFetchMetadata>(cachePath, {
    source: "ubuntu",
    fetchedAt: new Date().toISOString(),
    url: COMPONENTS.map(packagesUrl).join(", "),
    entryCount: entries.length,
    suite: SUITE,
    component: COMPONENTS.join("+"),
    arch: ARCH,
  });

  return entries.length;
}
