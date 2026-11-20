import { fileURLToPath } from "node:url";
import { toMapByKey } from "helpers4/map";
import { z } from "zod";
import { readJson } from "../_shared/json";
import type { CatalogApp } from "./types";

const DISPLAY_NAMES_PATH = fileURLToPath(
  new URL("../../../config/enrich-display-names.json", import.meta.url),
);

const DisplayNameEntrySchema = z.object({
  appId: z.string().describe('The app\'s catalog id, as in its page URL, e.g. "gimp".'),
  name: z.string().min(1).describe('The name to show instead, e.g. "GIMP".'),
  reason: z
    .string()
    .describe(
      "Why the store's name is wrong and where the right one comes from — required so the rename is auditable later.",
    ),
});

export type DisplayNameEntry = z.infer<typeof DisplayNameEntrySchema>;

export const DisplayNamesListSchema = z.array(DisplayNameEntrySchema).meta({
  title: "Enrich: display names",
  description:
    'Replaces the name the best source gives an app when that name is not the one people know it by (Flathub calls GIMP "GNU Image Manipulation Program"). Curated by hand, never inferred from acronyms: "Eye of GNOME" or "Universal Radio Hacker" are rightly shown in full.',
});

/** Loads the hand-curated display names (`config/enrich-display-names.json`, missing file reads as empty). */
export function loadDisplayNames(): DisplayNameEntry[] {
  return readJson(DISPLAY_NAMES_PATH, DisplayNamesListSchema);
}

/**
 * Gives each app listed in `entries` its curated name. An id that no
 * longer resolves is skipped, like `applySuites`. Mutates `apps` in place.
 */
export function applyDisplayNames(apps: CatalogApp[], entries: DisplayNameEntry[]): void {
  const byId = toMapByKey(apps, (app) => app.id);
  for (const entry of entries) {
    const app = byId.get(entry.appId);
    if (app) app.name = entry.name;
  }
}
