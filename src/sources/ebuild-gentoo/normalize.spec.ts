import { describe, expect, it } from "vitest";
import { channelFromKeywords, normalize } from "./normalize";
import type { GentooCacheEntry } from "./types";

describe("gentoo normalize", () => {
  it("maps a cache entry to a SourcedPackage, using category/name as appId and category as section", () => {
    const entry: GentooCacheEntry = {
      category: "games-strategy",
      name: "0ad",
      version: "0.28.0-r1",
      description: "A free, real-time strategy game",
      homepage: "https://play0ad.com/",
    };

    expect(normalize([entry])).toEqual([
      {
        source: "ebuild-gentoo",
        name: "0ad",
        description: "A free, real-time strategy game",
        version: "0.28.0-r1",
        appId: "games-strategy/0ad",
        homepage: "https://play0ad.com/",
        section: "games-strategy",
      },
    ]);
  });

  it("derives the channel from the amd64 keyword", () => {
    const entry: GentooCacheEntry = {
      category: "app-misc",
      name: "foo",
      version: "1.0",
      description: "",
      keywords: "~arm64 amd64",
    };
    expect(normalize([entry])[0]?.channel).toBe("stable");
    expect(normalize([{ ...entry, keywords: undefined }])[0]?.channel).toBeUndefined();
  });
});

describe("channelFromKeywords", () => {
  it("maps amd64 to stable and ~amd64 to testing", () => {
    expect(channelFromKeywords("amd64 arm64")).toBe("stable");
    expect(channelFromKeywords("~amd64 ~arm64")).toBe("testing");
  });

  it("leaves other cases undefined", () => {
    expect(channelFromKeywords("arm64 ~x86")).toBeUndefined();
    expect(channelFromKeywords("-amd64")).toBeUndefined();
    expect(channelFromKeywords("")).toBeUndefined();
    expect(channelFromKeywords(undefined)).toBeUndefined();
  });
});
