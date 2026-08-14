import { beforeAll, describe, expect, it } from "vitest";
import { buildDataset, type Dataset } from "./build-dataset";

// Groups ~357k real cached packages (every source except GitHub Releases)
// via @tuxery/matcher's bucketed groupPackages — ~111s, up from ~51s at
// ~268k without Ubuntu/Arch. Growth is now super-linear (1.33x the
// packages took 2.2x the time), likely Arch/AUR both being full of
// "python-*"-style names and Debian/Ubuntu both being full of "lib*-dev"
// ones, doubling up the collisions in those buckets. Still deliberately
// not re-tuning the bucketing here (see the "Matcher bucket sizes growing
// again" card) — but this is close to where "reactive timeout bump" stops
// being a reasonable response; flagged back to the user rather than
// bumped unilaterally past this point. Building the dataset once in
// beforeAll (instead of per-`it`) keeps the suite from paying that cost
// twice.
const BUILD_TIMEOUT = 180_000;

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

    // Guards against the matcher silently dropping packages while grouping,
    // not an exact count — GitHub Releases isn't wired in yet.
    expect(packageCount).toBeGreaterThan(350_000);
  });
});
