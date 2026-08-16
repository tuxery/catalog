import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { UbuntuCacheEntry } from "./types";

describe("ubuntu normalize", () => {
  it("maps a cache entry to a SourcedPackage, using the name as appId", () => {
    const entry: UbuntuCacheEntry = {
      name: "0ad",
      description: "Real-time strategy game of ancient warfare",
      version: "0.27.0-2+b1",
      homepage: "https://play0ad.com/",
      component: "universe",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "ubuntu",
        name: "0ad",
        description: "Real-time strategy game of ancient warfare",
        version: "0.27.0-2+b1",
        appId: "0ad",
        homepage: "https://play0ad.com/",
      },
    ]);
  });

  it("strips the component prefix from a non-main Section value", () => {
    const entry: UbuntuCacheEntry = {
      name: "0ad",
      description: "",
      version: "1",
      component: "universe",
      section: "universe/games",
    };

    expect(normalize([entry])[0]?.section).toBe("games");
  });

  it("leaves a main-component Section value (no prefix) untouched", () => {
    const entry: UbuntuCacheEntry = {
      name: "curl",
      description: "",
      version: "1",
      component: "main",
      section: "utils",
    };

    expect(normalize([entry])[0]?.section).toBe("utils");
  });
});
