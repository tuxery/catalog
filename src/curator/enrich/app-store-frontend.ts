import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { SourcedPackage } from "../../sources";
import { readJson } from "../_shared/json";

const APP_STORE_TAGS_PATH = fileURLToPath(
  new URL("../../../config/enrich-app-store-tags.json", import.meta.url),
);

const AppStoreFrontendEntrySchema = z.object({
  sources: z
    .array(z.string())
    .min(1)
    .describe(
      'PackageSourceId values (<format>-<provider>, e.g. "deb-debian") this exact name has actually been checked on — not a wildcard across every source.',
    ),
  name: z.string().describe("The exact SourcedPackage.name on every listed source."),
  reason: z
    .string()
    .describe(
      "Why this is really an app-store/package-manager frontend and not a coincidental name match — required so the tag is auditable later, not just an unexplained line.",
    ),
});

export type AppStoreFrontendEntry = z.infer<typeof AppStoreFrontendEntrySchema>;

export const AppStoreTagsListSchema = z.array(AppStoreFrontendEntrySchema).meta({
  title: "Enrich: app-store frontend tags",
  description:
    "Known app-store/package-manager frontends (GNOME Software, KDE Discover, Synaptic, ...) — sets CatalogApp.appStoreFrontend = true on any app carrying a matching package, see enrich/types.ts's doc comment for why. Tags a package, doesn't exclude it — it still shows up in the catalog, just labeled.",
});

/** Loads the hand-curated app-store/package-manager frontend tag list (`config/enrich-app-store-tags.json`, missing file reads as empty). */
export function loadAppStoreFrontends(): AppStoreFrontendEntry[] {
  return readJson(APP_STORE_TAGS_PATH, AppStoreTagsListSchema);
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
