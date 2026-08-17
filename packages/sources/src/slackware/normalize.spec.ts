import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { SlackwareCacheEntry } from "./types";

describe("slackware normalize", () => {
  it("maps a cache entry to a SourcedPackage, using the series as section", () => {
    const entry: SlackwareCacheEntry = {
      name: "gparted",
      version: "1.7.0-1",
      summary: "gparted (Graphical partition editor)",
      homepage: "https://gparted.org",
      series: "xap",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "slackware",
        name: "gparted",
        description: "gparted (Graphical partition editor)",
        version: "1.7.0-1",
        appId: "gparted",
        homepage: "https://gparted.org",
        section: "xap",
      },
    ]);
  });
});
