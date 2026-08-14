import { beforeAll, describe, expect, it } from "vitest";
import { buildDataset, type Dataset } from "./build-dataset";

// Groups ~123k real cached packages (Flathub + Snapcraft + AppImage + AUR)
// via @tuxery/matcher's bucketed groupPackages — a few seconds, comfortably
// under Vitest's 5s default but still bumped for headroom as more sources
// land. Building the dataset once in beforeAll (instead of per-`it`) keeps
// the suite from paying that cost twice.
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

    // Guards against the matcher silently dropping packages while grouping,
    // not an exact count — GitHub Releases/Debian/Fedora aren't wired in yet.
    expect(packageCount).toBeGreaterThan(100_000);
  });
});
