import { fileURLToPath } from "node:url";
import type { SourcedPackage } from "../../sources";
import { readNdjson } from "../_shared/ndjson";

const APP_STORE_FRONTENDS_PATH = fileURLToPath(
  new URL("../../../config/overrides/app-store-frontends.ndjson", import.meta.url),
);

export interface AppStoreFrontendEntry {
  source: string;
  name: string;
  reason: string;
}

/** Loads the hand-curated app-store/package-manager frontend list (`config/overrides/app-store-frontends.ndjson`, missing file reads as empty). */
export function loadAppStoreFrontends(): AppStoreFrontendEntry[] {
  return readNdjson<AppStoreFrontendEntry>(APP_STORE_FRONTENDS_PATH);
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
    frontends.some((entry) => entry.source === pkg.source && entry.name === pkg.name),
  );
}
