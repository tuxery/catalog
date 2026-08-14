import { describe, expect, it } from "vitest";
import { buildDataset } from "./build-dataset";

describe("buildDataset", () => {
  it("shapes a dataset with a generatedAt timestamp and an apps list", async () => {
    const dataset = await buildDataset();

    expect(dataset.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dataset.apps).toEqual([]);
  });
});
