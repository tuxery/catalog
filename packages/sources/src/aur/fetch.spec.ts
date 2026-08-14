import { describe, expect, it } from "vitest";
import { mapPackages } from "./fetch";

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

    expect(mapPackages(packages)).toEqual([
      {
        name: "python-django",
        description: "High-level Python web framework",
        version: "5.1-1",
        homepage: "https://www.djangoproject.com/",
      },
    ]);
  });

  it("drops entries with no name", () => {
    expect(mapPackages([{ Description: "orphaned" }])).toEqual([]);
  });

  it("falls back gracefully when optional fields are null/missing", () => {
    expect(mapPackages([{ Name: "bare-pkg", Description: null, URL: null }])).toEqual([
      { name: "bare-pkg", description: "", version: "unknown", homepage: undefined },
    ]);
  });
});
