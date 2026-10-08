import { describe, expect, it } from "vitest";
import { normalize, riskFromKeywords } from "./normalize";
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

  it("derives the risk from the amd64 keyword", () => {
    const entry: GentooCacheEntry = {
      category: "app-misc",
      name: "foo",
      version: "1.0",
      description: "",
      keywords: "~arm64 amd64",
    };
    expect(normalize([entry])[0]?.risk).toBeUndefined();
    expect(normalize([{ ...entry, keywords: "~amd64" }])[0]?.risk).toBe("candidate");
    expect(normalize([{ ...entry, keywords: undefined }])[0]?.risk).toBeUndefined();
  });

  it("reads -bin as upstream binaries packaged by Gentoo", () => {
    const entry: GentooCacheEntry = {
      category: "www-client",
      name: "firefox-bin",
      version: "157.0",
      description: "",
    };
    expect(normalize([entry])[0]).toMatchObject({ flavors: ["bin"], provenance: "upstream" });
  });
});

describe("riskFromKeywords", () => {
  it("maps amd64 to the default risk and ~amd64 to candidate", () => {
    expect(riskFromKeywords("amd64 arm64")).toBeUndefined();
    expect(riskFromKeywords("~amd64 ~arm64")).toBe("candidate");
  });

  it("leaves other cases undefined", () => {
    expect(riskFromKeywords("arm64 ~x86")).toBeUndefined();
    expect(riskFromKeywords("-amd64")).toBeUndefined();
    expect(riskFromKeywords("")).toBeUndefined();
    expect(riskFromKeywords(undefined)).toBeUndefined();
  });
});
