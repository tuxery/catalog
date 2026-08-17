import { gunzipSync } from "node:zlib";
import { parseDeb822 } from "../_shared/deb822";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { MxLinuxCacheEntry, MxLinuxFetchMetadata } from "./types";

// MX Linux publishes deb822 Packages files (same format/parser as
// Debian — MX Linux is a Debian derivative, using Debian's own release
// codenames rather than its own naming scheme like Mint), one "main"
// component covering the whole distro archive (861 packages), same
// situation as Pop!_OS/Deepin -- scoped down to genuinely MX-authored
// packages by name prefix ("mx", matching mx-*, mxNN-* per-release
// artwork packages, and the mxfb-* Fluxbox-edition variants uniformly)
// rather than the whole component. 142 packages on real data: real
// "MX Tools" apps (mx-tweak, mx-snapshot, mx-bootrepair, mx-cleanup,
// mx-live-usb-maker, mx-packageinstaller, mx-repo-manager, ...) mixed
// with per-language mx-docs-*/mx-faq-*/mxfb-docs-* documentation
// packages -- those are already caught by the existing NOISE_SECTIONS
// filter (verified Section: doc on real data), no new signal needed.
const RELEASE = "trixie";
const COMPONENT = "main";
const ARCH = "amd64";
const PACKAGES_URL = `https://mxrepo.com/mx/repo/dists/${RELEASE}/${COMPONENT}/binary-${ARCH}/Packages.gz`;

const MX_PREFIX_PATTERN = /^mx/i;

/** Whether a package name looks like genuinely MX-authored software. Pure — no I/O. */
export function isMxPackage(name: string): boolean {
  return MX_PREFIX_PATTERN.test(name);
}

/**
 * Maps deb822 stanzas (already parsed by `_shared/deb822.ts`) to cache
 * rows, keeping only MX-authored packages. Pure — no I/O — so it's the
 * part covered by tests.
 */
export function parsePackages(text: string): MxLinuxCacheEntry[] {
  return parseDeb822(text)
    .filter((fields): fields is typeof fields & { Package: string } => Boolean(fields.Package))
    .filter((fields) => isMxPackage(fields.Package))
    .map((fields) => ({
      name: fields.Package,
      description: fields.Description ?? "",
      version: fields.Version ?? "unknown",
      homepage: fields.Homepage || undefined,
      section: fields.Section || undefined,
    }));
}

/**
 * Downloads MX Linux's `main` component Packages.gz and writes the
 * normalized entries to `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchMxLinux(cachePath: string): Promise<number> {
  const response = await fetch(PACKAGES_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch MX Linux Packages: ${response.status} ${response.statusText}`);
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  const text = gunzipSync(compressed).toString("utf8");
  const entries = parsePackages(text);

  writeNdjson(cachePath, entries);
  writeMetadata<MxLinuxFetchMetadata>(cachePath, {
    source: "mxlinux",
    fetchedAt: new Date().toISOString(),
    url: PACKAGES_URL,
    entryCount: entries.length,
    release: RELEASE,
    component: COMPONENT,
    arch: ARCH,
  });

  return entries.length;
}
