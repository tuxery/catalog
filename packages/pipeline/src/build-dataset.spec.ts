import { describe, expect, it } from "vitest";
import { buildDataset } from "./build-dataset";

describe("buildDataset", () => {
  it("shapes a dataset with a generatedAt timestamp and a non-empty apps list", async () => {
    const dataset = await buildDataset();

    expect(dataset.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dataset.apps.length).toBeGreaterThan(0);
  });

  it("accounts for every sourced package across the grouped apps", async () => {
    const dataset = await buildDataset();
    const packageCount = dataset.apps.reduce((sum, app) => sum + app.packages.length, 0);

    // Flathub is the only source with real data right now (Snapcraft/AppImage
    // still read an empty cache) — this just guards against the matcher
    // silently dropping packages while grouping, not an exact count.
    expect(packageCount).toBeGreaterThan(3000);
  });
});
