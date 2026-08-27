import { fileURLToPath } from "node:url";
import type { SourcedPackage } from "../../sources";
import { readJson } from "../_shared/json";

const APP_STORE_TAGS_PATH = fileURLToPath(
  new URL("../../../config/enrich-app-store-tags.json", import.meta.url),
);

export interface AppStoreFrontendEntry {
  sources: string[];
  name: string;
  reason: string;
}

/** Loads the hand-curated app-store/package-manager frontend tag list (`config/enrich-app-store-tags.json`, missing file reads as empty). */
export function loadAppStoreFrontends(): AppStoreFrontendEntry[] {
  return readJson<AppStoreFrontendEntry>(APP_STORE_TAGS_PATH);
}

/**
 * Whether any of an app's member packages is a known app-store/package-
 * manager frontend — see `enrich/types.ts`'s `CatalogApp.appStoreFrontend`
 * doc comment for why this is an exact-name list rather than a
 * name/description pattern.
 */
export function isAppStoreFrontend(
  packages: SourcedPackage[],
  frontends: AppStoreFrontendEntry[],
): boolean {
  return packages.some((pkg) =>
    frontends.some((entry) => entry.name === pkg.name && entry.sources.includes(pkg.source)),
  );
}
