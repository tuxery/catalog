import { parseDeb822 } from "../_shared/deb822";
import { fetchGunzippedText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { MintCacheEntry, MintFetchMetadata } from "./types";

// Linux Mint publishes deb822 Packages files (same format as Debian/
// Ubuntu, parsed with the same _shared/deb822.ts — Mint is a Debian/
// Ubuntu derivative) across several components: main (Mint's own,
// first-party apps — mintinstall, Warpinator, Hypnotix, Bulky, ...),
// upstream (rebuilds of existing software, e.g. patched Chromium/Caja —
// mostly redundant with Ubuntu's own coverage), import (third-party
// proprietary convenience packages, e.g. Dropbox/Spotify — not Mint's
// own software), and romeo/multiverse/universe (empty on real data).
// Scoped to "main" only, matching the "genuinely unique in-house
// software" intent this connector was added for — upstream/import are a
// different category (rebuilds and third-party imports, not
// Mint-authored apps), tracked as a possible follow-on rather than
// bundled in here.
//
// HTTP, not HTTPS: matches the real, official default
// /etc/apt/sources.list.d/official-package-repositories.list Mint ships
// (http://packages.linuxmint.com, not https) — this isn't a workaround,
// it's the actual supported scheme; HTTPS to this host also timed
// out/refused the connection during development, consistent with that.
const RELEASE = "zena";
const COMPONENT = "main";
const ARCH = "amd64";
const PACKAGES_URL = `http://packages.linuxmint.com/dists/${RELEASE}/${COMPONENT}/binary-${ARCH}/Packages.gz`;

/**
 * Maps deb822 stanzas (already parsed by `_shared/deb822.ts`) to cache
 * rows. Pure — no I/O — so it's the part covered by tests.
 */
export function parsePackages(text: string): MintCacheEntry[] {
  return parseDeb822(text)
    .filter((fields): fields is typeof fields & { Package: string } => Boolean(fields.Package))
    .map((fields) => ({
      name: fields.Package,
      description: fields.Description ?? "",
      version: fields.Version ?? "unknown",
      homepage: fields.Homepage || undefined,
      section: fields.Section || undefined,
    }));
}

/**
 * Downloads Linux Mint's `main` component Packages.gz and writes the
 * normalized entries to `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchMint(cachePath: string): Promise<number> {
  const text = await fetchGunzippedText(PACKAGES_URL, "Linux Mint Packages");
  const entries = parsePackages(text);

  writeNdjson(cachePath, entries);
  writeMetadata<MintFetchMetadata>(cachePath, {
    source: "deb-mint",
    fetchedAt: new Date().toISOString(),
    url: PACKAGES_URL,
    entryCount: entries.length,
    release: RELEASE,
    component: COMPONENT,
    arch: ARCH,
  });

  return entries.length;
}
