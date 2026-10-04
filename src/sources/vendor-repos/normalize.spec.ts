import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";

describe("vendor-repos normalize", () => {
  it("maps a cache entry to a stable SourcedPackage with a vendor-scoped appId", () => {
    expect(
      normalize([
        {
          vendor: "google",
          name: "Google Chrome",
          package: "google-chrome-stable",
          indexUrl:
            "https://dl.google.com/linux/chrome/deb/dists/stable/main/binary-amd64/Packages",
          homepage: "https://www.google.com/chrome/",
          description: "The web browser from Google",
          version: "141.0.7390.54-1",
        },
      ]),
    ).toEqual([
      {
        source: "vendor-repos",
        name: "Google Chrome",
        description: "The web browser from Google",
        version: "141.0.7390.54-1",
        appId: "google/google-chrome-stable",
        homepage: "https://www.google.com/chrome/",
        channel: "stable",
      },
    ]);
  });
});
