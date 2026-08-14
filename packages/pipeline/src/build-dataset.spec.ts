import { beforeAll, describe, expect, it } from "vitest";
import { buildDataset, type Dataset } from "./build-dataset";

// Groups ~192k real cached packages (Flathub + Snapcraft + AppImage + AUR +
// Debian) via @tuxery/matcher's bucketed groupPackages — ~26s, up from ~6s
// at ~123k (Debian's own package-naming conventions, e.g. "lib*-dev",
// collide with AUR's in the same buckets). The bucketing in group.ts keeps
// this tractable, not fast — reads as an early warning that it'll need
// revisiting again before Fedora lands, not a closed matter. Building the
// dataset once in beforeAll (instead of per-`it`) keeps the suite from
// paying that cost twice.
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

    // Guards against the matcher silently dropping packages while grouping,
    // not an exact count — GitHub Releases and Fedora aren't wired in yet.
    expect(packageCount).toBeGreaterThan(180_000);
  });
});
