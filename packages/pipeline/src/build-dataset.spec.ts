import { beforeAll, describe, expect, it } from "vitest";
import { buildDataset, type Dataset } from "./build-dataset";

// groupPackages is deliberately O(n²) (see @tuxery/matcher's group.ts) — at
// Flathub + Snapcraft's combined ~4,900 real cached packages that's slow
// enough to need a bumped timeout. Tracked as its own card ("Matcher
// performance: avoid O(n²) once combined source volume grows") rather than
// fixed incidentally here. Building the dataset once in beforeAll (instead
// of per-`it`) keeps the suite from paying that cost twice.
const BUILD_TIMEOUT = 30_000;

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

    // AppImage still reads an empty cache — this just guards against the
    // matcher silently dropping packages while grouping, not an exact count.
    expect(packageCount).toBeGreaterThan(4000);
  });
});
