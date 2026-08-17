import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { MxLinuxCacheEntry } from "./types";

describe("mxlinux normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: MxLinuxCacheEntry = {
      name: "mx-tweak",
      description: "MX Tweak",
      version: "25.0-1",
      homepage: "https://github.com/MX-Linux/mx-tweak",
      section: "utils",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "deb-mxlinux",
        name: "mx-tweak",
        description: "MX Tweak",
        version: "25.0-1",
        appId: "mx-tweak",
        homepage: "https://github.com/MX-Linux/mx-tweak",
        section: "utils",
      },
    ]);
  });
});
