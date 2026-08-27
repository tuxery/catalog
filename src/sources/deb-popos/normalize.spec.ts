import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { PopOsCacheEntry } from "./types";

describe("popos normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: PopOsCacheEntry = {
      name: "cosmic-files",
      description: "The COSMIC Files application",
      version: "1.0.0",
      homepage: "https://github.com/pop-os/cosmic-files",
      section: "admin",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "deb-popos",
        name: "cosmic-files",
        description: "The COSMIC Files application",
        version: "1.0.0",
        appId: "cosmic-files",
        homepage: "https://github.com/pop-os/cosmic-files",
        section: "admin",
      },
    ]);
  });
});
