import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Sources whose data must not be redistributed publicly: their cache is not
 * committed here (this repository is public, and docs/open-data promises its
 * caches as downloads) but in the private tuxery/source-cache repository. A
 * source goes on this list when its terms or maintainers say so, or as our own
 * precaution when its terms couldn't be read and its text isn't ours to share:
 *
 * - `appimagehub`: opendesktop.org allowed a weekly read-only sync on
 *   2026-10-20 on condition that their data is neither committed to this
 *   public repository nor redistributed as a dataset (docs/sources.md).
 * - `gog`: our precaution, not a request from GOG and not a ban we found. Its
 *   User Agreement sits behind an anti-bot page, so it is unread, and the
 *   cache holds full store descriptions (docs/sources.md, config/source-terms.json).
 * - `flatpak-flathub`: our decision. Flathub said scraping their API is not
 *   welcome (2026-11-10) and pointed to the appstream file we now read alone;
 *   whether a public copy of it is fine was left unanswered, and their site
 *   terms forbid copying "any portion of the Service".
 *
 * Without a checkout of that repository (an outside contributor) these
 * sources read as empty and the pipeline builds without them.
 */
export const RESTRICTED_SOURCES: ReadonlySet<string> = new Set([
  "appimagehub",
  "flatpak-flathub",
  "gog",
]);

/**
 * Whether any of `packages` comes from a restricted source. A merged app's
 * name or description can come from such a package, so tools that send those
 * fields out of the pipeline, or log them publicly, skip the whole app.
 */
export function hasRestrictedPackage(packages: readonly { source: string }[]): boolean {
  return packages.some((pkg) => RESTRICTED_SOURCES.has(pkg.source));
}

const PUBLIC_CACHE_DIR = fileURLToPath(new URL("../cache/", import.meta.url));

/**
 * Where the private caches live: `TUXERY_PRIVATE_CACHE_DIR`, else a
 * tuxery/source-cache checkout next to this repository (the dev container
 * clones it there), in its `cache/` folder.
 */
export function privateCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.TUXERY_PRIVATE_CACHE_DIR ??
    fileURLToPath(new URL("../../../../source-cache/cache/", import.meta.url))
  );
}

/** The NDJSON cache file of `source`: the public one, or the private one for a restricted source. */
export function cachePathFor(source: string, env: NodeJS.ProcessEnv = process.env): string {
  const dir = RESTRICTED_SOURCES.has(source) ? privateCacheDir(env) : PUBLIC_CACHE_DIR;
  return join(dir, `${source}.ndjson`);
}

/** Whether `source`'s cache can be read and written here: always for a public source, only with the private checkout for a restricted one. */
export function hasCacheDir(source: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return !RESTRICTED_SOURCES.has(source) || existsSync(privateCacheDir(env));
}

/**
 * Whether `source`'s cache file itself is here. `hasCacheDir` isn't enough to
 * publish: the checkout exists as soon as one private cache does, and a source
 * whose file is missing would read as empty and lose all its apps.
 */
export function hasCacheFile(source: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return existsSync(cachePathFor(source, env));
}
