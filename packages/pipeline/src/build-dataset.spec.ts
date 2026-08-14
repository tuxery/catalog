import { beforeAll, describe, expect, it } from "vitest";
import { buildDataset, type Dataset } from "./build-dataset";

// Groups ~303k real cached packages (357k raw, minus ~54k filtered out by
// @tuxery/curator's filterPackages — mostly -dev/-dbg/-doc/lib-soname
// packages from Debian/Ubuntu, much less effective on AUR/Arch, see the
// "Filter is far less effective on AUR/Arch" card). Filtering alone
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
    // an exact count, GitHub Releases isn't wired in yet.
    expect(packageCount).toBeGreaterThan(280_000);
  });
});
