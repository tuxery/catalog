import { fileURLToPath } from "node:url";
import { toMapByKey } from "@helpers4/map";
import { z } from "zod";
import { readJson } from "../_shared/json";
import type { CatalogApp } from "./types";

const SUITES_PATH = fileURLToPath(new URL("../../../config/enrich-suites.json", import.meta.url));

const SuiteComponentRefSchema = z.object({
  appId: z.string().describe("The component's own catalog id (source:appId)."),
  name: z.string().describe('The component\'s display name, e.g. "LibreOffice Writer".'),
});

export type SuiteComponentRef = z.infer<typeof SuiteComponentRefSchema>;

const SuiteOverrideEntrySchema = z.object({
  suiteId: z.string().describe("A stable, unique identifier for this suite (not shown to users)."),
  suiteName: z.string().describe('The suite\'s display name, e.g. "LibreOffice".'),
  mainAppId: z
    .string()
    .describe(
      'The bundled/full-suite app\'s own catalog id (source:appId), e.g. "flatpak-flathub:org.libreoffice.LibreOffice".',
    ),
  components: z
    .array(SuiteComponentRefSchema)
    .min(1)
    .describe("Every independently-installable component of this suite."),
  reason: z
    .string()
    .describe(
      "How this was verified — required so the grouping is auditable later, not just an unexplained line.",
    ),
});

export type SuiteOverrideEntry = z.infer<typeof SuiteOverrideEntrySchema>;

export const EnrichSuitesListSchema = z.array(SuiteOverrideEntrySchema).meta({
  title: "Enrich: software suites",
  description:
    'Software suites (a bundled "main" app plus separately installable "component" apps — e.g. LibreOffice/Writer/Calc/...) that aren\'t a single-app matching decision, so don\'t fit filter/match\'s override shapes. Deliberately not auto-detected from names — curated by hand and narrow rather than pattern-matched.',
});

/** Loads the hand-curated suite list (`config/enrich-suites.json`, missing file reads as empty). */
export function loadSuiteOverrides(): SuiteOverrideEntry[] {
  return readJson(SUITES_PATH, EnrichSuitesListSchema);
}

/**
 * Sets `CatalogApp.suite` on the main app and each of its components, for
 * every suite in `suites` whose main app and at least one component can
 * be found (by id) among `apps` — a suite/component id that doesn't
 * resolve (e.g. after a matching-logic change shifts which package
 * "wins" as an app's representative, changing its id) is silently
 * skipped rather than throwing, since this runs over the real,
 * occasionally-shifting merged catalog, not a fixed fixture. Deliberately
 * doesn't record which sources are "bundled" vs. "component-only" as a
 * separate field — that's already directly readable from each app's own
 * `packages` array (a source present there installs *this* app
 * directly), so `app` doesn't need anything more than the relationship
 * itself to build the right per-source CTA. Mutates `apps` in place. No
 * I/O — the override list is passed in already loaded.
 */
export function applySuites(apps: CatalogApp[], suites: SuiteOverrideEntry[]): void {
  const byId = toMapByKey(apps, (app) => app.id);

  for (const suite of suites) {
    const mainApp = byId.get(suite.mainAppId);
    if (!mainApp) continue;

    const components = suite.components
      .map((ref) => ({ ref, app: byId.get(ref.appId) }))
      .filter((entry): entry is { ref: SuiteComponentRef; app: CatalogApp } => Boolean(entry.app));
    if (components.length === 0) continue;

    mainApp.suite = {
      id: suite.suiteId,
      name: suite.suiteName,
      role: "main",
      components: components.map(({ ref }) => ({ id: ref.appId, name: ref.name })),
    };

    for (const { app } of components) {
      app.suite = {
        id: suite.suiteId,
        name: suite.suiteName,
        role: "component",
        mainApp: { id: mainApp.id, name: mainApp.name },
      };
    }
  }
}
