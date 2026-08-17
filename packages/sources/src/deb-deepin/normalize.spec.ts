import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { DeepinCacheEntry } from "./types";

describe("deepin normalize", () => {
  it("maps a cache entry to a SourcedPackage", () => {
    const entry: DeepinCacheEntry = {
      name: "dde-calendar",
      description: "Calendar is a smart daily planner",
      version: "5.9.14-1",
      homepage: "https://github.com/linuxdeepin/dde-calendar",
      section: "utils",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "deb-deepin",
        name: "dde-calendar",
        description: "Calendar is a smart daily planner",
        version: "5.9.14-1",
        appId: "dde-calendar",
        homepage: "https://github.com/linuxdeepin/dde-calendar",
        section: "utils",
      },
    ]);
  });
});
