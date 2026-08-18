import { describe, expect, it } from "vitest";
import { mapPackages, rankPopularity } from "./fetch";

describe("mapPackages", () => {
  it("maps a raw AUR package to a cache entry", () => {
    const packages = [
      {
        Name: "python-django",
        Description: "High-level Python web framework",
        Version: "5.1-1",
        URL: "https://www.djangoproject.com/",
      },
    ];

    expect(mapPackages(packages, new Map())).toEqual([
      {
        name: "python-django",
        description: "High-level Python web framework",
        version: "5.1-1",
        homepage: "https://www.djangoproject.com/",
        popularity: undefined,
      },
    ]);
  });

  it("drops entries with no name", () => {
    expect(mapPackages([{ Description: "orphaned" }], new Map())).toEqual([]);
  });

  it("falls back gracefully when optional fields are null/missing", () => {
    expect(mapPackages([{ Name: "bare-pkg", Description: null, URL: null }], new Map())).toEqual([
      {
        name: "bare-pkg",
        description: "",
        version: "unknown",
        homepage: undefined,
        popularity: undefined,
      },
    ]);
  });

  it("sets popularity from the rank map when present", () => {
    const packages = [{ Name: "yay", Description: "", Version: "1" }];
    const ranks = new Map([["yay", 1]]);

    expect(mapPackages(packages, ranks)[0]?.popularity).toBe(1);
  });
});

describe("rankPopularity", () => {
  it("ranks packages with real Popularity into a 0-1 percentile score, highest first", () => {
    const packages = [
      { Name: "a", Popularity: 10 },
      { Name: "b", Popularity: 30 },
      { Name: "c", Popularity: 20 },
    ];

    const ranks = rankPopularity(packages);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("c")).toBeCloseTo(0.5, 5);
    expect(ranks.get("a")).toBe(0);
  });

  it("leaves packages with zero or missing Popularity unranked, not a fake bottom score", () => {
    const packages = [
      { Name: "real", Popularity: 5 },
      { Name: "zero", Popularity: 0 },
      { Name: "missing" },
    ];

    const ranks = rankPopularity(packages);
    expect(ranks.has("zero")).toBe(false);
    expect(ranks.has("missing")).toBe(false);
    expect(ranks.get("real")).toBe(1);
  });

  it("scores the sole ranked package as 1 rather than dividing by zero", () => {
    const ranks = rankPopularity([{ Name: "only", Popularity: 5 }]);
    expect(ranks.get("only")).toBe(1);
  });
});
