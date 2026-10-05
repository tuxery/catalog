import { beforeAll, describe, expect, it } from "vitest";
import { filterPackages, groupPackages } from "../curator";
import { searchAllSources } from "../sources";
import { buildDataset, type Dataset } from "./build-dataset";

// The full pipeline over every real cached source: reading and filtering
// (~650k raw packages → ~300k candidates) and grouping take ~2-3 s, but
// enrichApps ~13 s (2026-10-05, after cachePerPattern halved it), more on
// CI runners. Built once in beforeAll, never once per test or per variant.
const BUILD_TIMEOUT = 120_000;

describe("groupPackages over the real caches", () => {
  it(
    "puts every filtered package into exactly one group",
    async () => {
      // Guards against grouping silently dropping or duplicating packages.
      // filterPackages dropping some is expected; groupPackages must keep
      // all of the rest. Checked before enrichment, so neither its cost nor
      // the LLM's exclusions (whole apps left out on purpose) blur the count.
      const candidates = filterPackages(await searchAllSources(""));
      const grouped = groupPackages(candidates).flatMap((group) => group.packages);
      expect(grouped.length).toBe(candidates.length);
      expect(new Set(grouped).size).toBe(candidates.length);
    },
    BUILD_TIMEOUT,
  );
});

describe("buildDataset", () => {
  let dataset: Dataset;

  beforeAll(async () => {
    dataset = await buildDataset();
  }, BUILD_TIMEOUT);

  it("shapes a dataset with a generatedAt timestamp and a non-empty apps list", () => {
    expect(dataset.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dataset.apps.length).toBeGreaterThan(0);
  });

  it("leaves out every app the LLM marked excluded (libraries, other non-apps)", () => {
    expect(dataset.apps.some((app) => app.excluded !== undefined)).toBe(false);
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
