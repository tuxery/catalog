import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Sources whose data must not be redistributed publicly: their cache is not
 * committed here (this repository is public, and docs/open-data promises its
 * caches as downloads) but in the private tuxery/source-cache repository. A
 * source goes on this list only when its own terms or maintainers say so:
 *
 * - `appimagehub`: opendesktop.org allowed a weekly read-only sync on
 *   2026-10-20 on condition that their data is neither committed to this
 *   public repository nor redistributed as a dataset (docs/sources.md).
 *
 * Without a checkout of that repository (an outside contributor, `app`'s CI)
 * these sources read as empty and the pipeline builds without them.
 */
export const RESTRICTED_SOURCES: ReadonlySet<string> = new Set(["appimagehub"]);

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
