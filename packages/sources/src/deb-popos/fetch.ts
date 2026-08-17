import { gunzipSync } from "node:zlib";
import { parseDeb822 } from "../_shared/deb822";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { PopOsCacheEntry, PopOsFetchMetadata } from "./types";

// Pop!_OS publishes deb822 Packages files (same format as Debian/Ubuntu,
// parsed with the same _shared/deb822.ts — Pop!_OS is a derivative)
// under one "main" component. Unlike Mint, this single component mixes
// System76's own software with hundreds of unrelated rebuilds System76
// maintains for its own infra needs (firefox + every firefox-locale-*,
// thunderbird + every thunderbird-locale-*, ubuntu-release-upgrader,
// greetd, flatpak, ...) -- checked the "Maintainer contains system76"
// field as a possible inclusion signal and rejected it: it pulls in all
// of those rebuilds too (274 packages), overwhelmingly not System76's
// own apps. Name prefix is the reliable signal instead -- cosmic-*
// (System76's from-scratch Rust desktop environment: cosmic-files,
// cosmic-edit, cosmic-term, cosmic-store, ...), pop-* (pop-launcher,
// pop-upgrade, ...), and system76* (system76-keyboard-configurator,
// system76-power, ...) -- 74 packages on real data, matching every
// example the "Derivative distros" card named. A few other real
// System76-authored tools exist outside these prefixes (popsicle, the
// USB flasher; firmware-manager; tensorman) but are deliberately left
// out rather than hand-picked in -- the prefix rule is simple and
// explainable, cherry-picking a few extra names by hand isn't worth the
// added complexity here.
const RELEASE = "resolute";
const COMPONENT = "main";
const ARCH = "amd64";
const PACKAGES_URL = `https://apt.pop-os.org/release/dists/${RELEASE}/${COMPONENT}/binary-${ARCH}/Packages.gz`;

const SYSTEM76_PREFIX_PATTERN = /^(cosmic-|pop-|system76)/;

/** Whether a package name looks like genuinely System76-authored software, not a rebuild of something else. Pure — no I/O. */
export function isSystem76Package(name: string): boolean {
  return SYSTEM76_PREFIX_PATTERN.test(name);
}

/**
 * Maps deb822 stanzas (already parsed by `_shared/deb822.ts`) to cache
 * rows, keeping only System76-authored packages. Pure — no I/O — so
 * it's the part covered by tests.
 */
export function parsePackages(text: string): PopOsCacheEntry[] {
  return parseDeb822(text)
    .filter((fields): fields is typeof fields & { Package: string } => Boolean(fields.Package))
    .filter((fields) => isSystem76Package(fields.Package))
    .map((fields) => ({
      name: fields.Package,
      description: fields.Description ?? "",
      version: fields.Version ?? "unknown",
      homepage: fields.Homepage || undefined,
      section: fields.Section || undefined,
    }));
}

/**
 * Downloads Pop!_OS's `main` component Packages.gz and writes the
 * normalized entries to `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchPopOs(cachePath: string): Promise<number> {
  const response = await fetch(PACKAGES_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Pop!_OS Packages: ${response.status} ${response.statusText}`);
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  const text = gunzipSync(compressed).toString("utf8");
  const entries = parsePackages(text);

  writeNdjson(cachePath, entries);
  writeMetadata<PopOsFetchMetadata>(cachePath, {
    source: "deb-popos",
    fetchedAt: new Date().toISOString(),
    url: PACKAGES_URL,
    entryCount: entries.length,
    release: RELEASE,
    component: COMPONENT,
    arch: ARCH,
  });

  return entries.length;
}
