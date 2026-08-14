import { beforeAll, describe, expect, it } from "vitest";
import { buildDataset, type Dataset } from "./build-dataset";

// Groups ~268k real cached packages (Flathub + Snapcraft + AppImage + AUR +
// Debian + Fedora) via @tuxery/matcher's bucketed groupPackages — ~51s, up
// from ~26s at ~192k without Fedora. Deliberately not re-tuning the
// bucketing again here (see the "Matcher bucket sizes growing again"
// card) — just giving the timeout enough headroom to stay green until
// that gets a real redesign with the full source picture in view, not
// another reactive patch per source. Building the dataset once in
// beforeAll (instead of per-`it`) keeps the suite from paying that cost
// twice.
const BUILD_TIMEOUT = 90_000;

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
    expect(packageCount).toBeGreaterThan(260_000);
  });
});
