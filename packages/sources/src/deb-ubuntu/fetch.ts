import { parseDeb822 } from "../_shared/deb822";
import { fetchGunzippedText, fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { UbuntuCacheEntry, UbuntuFetchMetadata } from "./types";

// Ubuntu publishes one Packages file per suite/component/arch, same deb822
// mechanism as Debian (it's a Debian derivative) but with its own
// codename-based suites instead of "stable" — the codename is resolved
// live (see `fetchCurrentSuite`) rather than hardcoded, since a fixed
// codename would silently go stale every ~6 months, the way Fedora's
// RELEASE constant did.
//
// Unlike Debian, "main" alone is badly incomplete here: Ubuntu's
// main/universe split is by *support tier* (Canonical-supported vs.
// community-maintained), not license status like Debian's main/contrib/
// non-free — most desktop apps live in universe, not main. restricted
// (binary/proprietary drivers) and multiverse (copyright/legal-restricted
// software — codecs, some games) round out the four components, same
// spirit as Debian's contrib/non-free.
const COMPONENTS = ["main", "universe", "restricted", "multiverse"] as const;
type UbuntuComponent = (typeof COMPONENTS)[number];
const ARCH = "amd64";

function packagesUrl(suite: string, component: UbuntuComponent): string {
  return `https://archive.ubuntu.com/ubuntu/dists/${suite}/${component}/binary-${ARCH}/Packages.gz`;
}

interface LaunchpadSeries {
  name: string;
  status: string;
}

/**
 * Resolves the current stable release's codename from Launchpad's public
 * series list. Ubuntu has no Debian-`stable`-style always-current URL
 * alias in the archive itself (codenames are the only suite identifier,
 * and both LTS and interim releases stay "Supported" long after they
 * stop being current), so this leans on Launchpad's own
 * `status: "Current Stable Release"` marker instead, which names exactly
 * one series at a time — the same one a fresh `apt` install would use.
 * Pure — no I/O — given an already-fetched series list.
 */
export function resolveCurrentSuite(series: LaunchpadSeries[]): string {
  const current = series.find((entry) => entry.status === "Current Stable Release");
  if (!current) {
    throw new Error("Launchpad reported no current Ubuntu stable release");
  }

  return current.name;
}

async function fetchCurrentSuite(): Promise<string> {
  const response = await fetchOrThrow(
    "https://api.launchpad.net/devel/ubuntu/series",
    "Launchpad Ubuntu series",
  );
  const { entries } = (await response.json()) as { entries: LaunchpadSeries[] };
  return resolveCurrentSuite(entries);
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

async function fetchComponent(
  suite: string,
  component: UbuntuComponent,
): Promise<UbuntuCacheEntry[]> {
  const text = await fetchGunzippedText(
    packagesUrl(suite, component),
    `Ubuntu component "${component}"`,
  );
  return parsePackages(text, component);
}

/**
 * Downloads Ubuntu's Packages.gz for the current release's four
 * components and writes the normalized entries to `cachePath` as NDJSON
 * — each row keeps its source component (see `UbuntuCacheEntry.component`),
 * no cross-component dedup needed since a package name only ever belongs
 * to one. See docs/sources.md.
 */
export async function fetchUbuntu(cachePath: string): Promise<number> {
  const suite = await fetchCurrentSuite();
  const entriesByComponent = await Promise.all(
    COMPONENTS.map((component) => fetchComponent(suite, component)),
  );
  const entries = entriesByComponent.flat();

  writeNdjson(cachePath, entries);
  writeMetadata<UbuntuFetchMetadata>(cachePath, {
    source: "deb-ubuntu",
    fetchedAt: new Date().toISOString(),
    url: COMPONENTS.map((component) => packagesUrl(suite, component)).join(", "),
    entryCount: entries.length,
    suite,
    component: COMPONENTS.join("+"),
    arch: ARCH,
  });

  return entries.length;
}
