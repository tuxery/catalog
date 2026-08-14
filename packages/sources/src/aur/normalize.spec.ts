import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { AurCacheEntry } from "./types";

describe("aur normalize", () => {
  it("maps a cache entry to a SourcedPackage, using the name as appId", () => {
    const entry: AurCacheEntry = {
      name: "python-django",
      description: "High-level Python web framework",
      version: "5.1-1",
      homepage: "https://www.djangoproject.com/",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "aur",
        name: "python-django",
        description: "High-level Python web framework",
        version: "5.1-1",
        appId: "python-django",
        homepage: "https://www.djangoproject.com/",
      },
    ]);
  });
});
