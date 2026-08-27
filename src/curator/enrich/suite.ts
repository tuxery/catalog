import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import type { CatalogApp } from "./types";

const SUITES_PATH = fileURLToPath(
  new URL("../../../config/overrides/suites.ndjson", import.meta.url),
);

export interface SuiteComponentRef {
  appId: string;
  name: string;
}

export interface SuiteOverrideEntry {
  suiteId: string;
  suiteName: string;
  mainAppId: string;
  components: SuiteComponentRef[];
  reason: string;
}

/** Loads the hand-curated suite list (`config/overrides/suites.ndjson`, missing file reads as empty). */
export function loadSuiteOverrides(): SuiteOverrideEntry[] {
  return readNdjson<SuiteOverrideEntry>(SUITES_PATH);
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
  const byId = new Map(apps.map((app) => [app.id, app]));

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
