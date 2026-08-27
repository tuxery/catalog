import { beforeAll, describe, expect, it } from "vitest";
import { buildDataset, type Dataset } from "./build-dataset";

// Groups ~233k real cached packages after the curator module's filterPackages
// (raw cache is ~357k across all sources — the gap grew a lot once the
// lib* noise prefix was inverted to catch-by-default instead of soname-
// versioned-only, see filter/rules.ts's header comment). Filtering alone
// brought this from ~111s (unfiltered 357k) to ~35s; replacing the old
// bucketed pairwise-Levenshtein matcher with union-find + exact-key
// tiers (no scoring, no pairwise comparison at all) brought it under 1s.
// Building the dataset once in beforeAll (instead of per-`it`) keeps the
// suite from paying that cost twice.
const BUILD_TIMEOUT = 60_000;

describe("buildDataset", () => {
  let dataset: Dataset;

  beforeAll(async () => {
    dataset = await buildDataset();
  }, BUILD_TIMEOUT);

  it("shapes a dataset with a generatedAt timestamp and a non-empty apps list", () => {
    expect(dataset.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dataset.apps.length).toBeGreaterThan(0);
  });

  it("accounts for every sourced package across the grouped apps", () => {
    const packageCount = dataset.apps.reduce((sum, app) => sum + app.packages.length, 0);

    // Guards against the curator silently dropping packages while
    // grouping (filterPackages dropping some is expected and correct;
    // this checks groupPackages doesn't lose any on top of that) — not
    // an exact count, GitHub Releases isn't wired in yet. ~233k as of the
    // lib*-inversion filter change; leaves headroom below that for cache
    // churn without being so loose it'd miss a real grouping regression.
    expect(packageCount).toBeGreaterThan(220_000);
  });

  it("enriches every app with a display-ready id and name", () => {
    for (const app of dataset.apps) {
      expect(app.id).toBeTruthy();
      expect(app.name).toBeTruthy();
      // Not toBeTruthy(): some single-source AppImage entries genuinely
      // have no upstream description at all (see enrichApps's
      // pickDescription) — "" is the correct value there, not a bug.
      expect(typeof app.shortDescription).toBe("string");
    }
  });
});
