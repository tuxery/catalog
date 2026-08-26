import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { GithubReleasesCacheEntry } from "./types";

describe("github-releases normalize", () => {
  it("maps a cache entry to a SourcedPackage, using the Release page as homepage", () => {
    const entry: GithubReleasesCacheEntry = {
      name: "superfile",
      description: "Pretty fancy and modern terminal file manager",
      repo: "yorukot/superfile",
      version: "v1.3.1",
      homepage: "https://github.com/yorukot/superfile",
      releaseUrl: "https://github.com/yorukot/superfile/releases/tag/v1.3.1",
      stars: 22800,
    };

    expect(normalize([entry])).toEqual([
      {
        source: "github-releases",
        name: "superfile",
        description: "Pretty fancy and modern terminal file manager",
        version: "v1.3.1",
        appId: "yorukot/superfile",
        homepage: "https://github.com/yorukot/superfile/releases/tag/v1.3.1",
      },
    ]);
  });
});
