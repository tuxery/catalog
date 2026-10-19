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

  it("carries the stable release as a track, and leaves -current on the default line", () => {
    const [current, stable] = normalize([
      { name: "vim", version: "9.1-1", summary: "", series: "ap" },
      { name: "vim", version: "9.0-1", summary: "", series: "ap", track: "15.0" },
    ]);
    expect(current?.track).toBeUndefined();
    expect(stable?.track).toBe("15.0");
  });
});
