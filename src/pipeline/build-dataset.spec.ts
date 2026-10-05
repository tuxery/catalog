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
// suite from paying that cost per test. Built twice: the published dataset,
// and the one before LLM exclusions (`includeExcluded`), which is the one
// that still holds every grouped package.
const BUILD_TIMEOUT = 120_000;

describe("buildDataset", () => {
  let dataset: Dataset;
  let withExcluded: Dataset;

  beforeAll(async () => {
    dataset = await buildDataset();
    withExcluded = await buildDataset({ includeExcluded: true });
  }, BUILD_TIMEOUT);

  it("shapes a dataset with a generatedAt timestamp and a non-empty apps list", () => {
    expect(dataset.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dataset.apps.length).toBeGreaterThan(0);
  });

  it("accounts for every sourced package across the grouped apps", () => {
    // Counted before LLM exclusions: leaving out a library's packages is
    // intended (68.7k apps excluded as of 2026-10-05), losing them while
    // grouping isn't.
    const packageCount = withExcluded.apps.reduce((sum, app) => sum + app.packages.length, 0);

    // Guards against the curator silently dropping packages while
    // grouping (filterPackages dropping some is expected and correct;
    // this checks groupPackages doesn't lose any on top of that) — not
    // an exact count, GitHub Releases isn't wired in yet. ~233k as of the
    // lib*-inversion filter change; leaves headroom below that for cache
    // churn without being so loose it'd miss a real grouping regression.
    expect(packageCount).toBeGreaterThan(220_000);
  });

  it("leaves out every app the LLM marked excluded (libraries, other non-apps)", () => {
    expect(dataset.apps.some((app) => app.excluded !== undefined)).toBe(false);
  });

  it("leaves out only the excluded apps", () => {
    const excluded = withExcluded.apps.filter((app) => app.excluded !== undefined).length;
    expect(dataset.apps.length).toBe(withExcluded.apps.length - excluded);
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
