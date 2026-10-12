import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import { annotateMembers, nixTrackName, trackNames } from "./families";

const nix = (appId: string, name = "firefox"): SourcedPackage => ({
  source: "nix-nixpkgs",
  name,
  appId,
  description: "",
  version: "153.4.0esr",
});

describe("nixTrackName", () => {
  it("reads the track from the attribute, not from pname", () => {
    expect(nixTrackName(nix("firefox-esr"))).toBe("firefox-esr");
    expect(nixTrackName(nix("firefox-esr-unwrapped"))).toBe("firefox-esr");
    expect(nixTrackName(nix("firefox-esr-153"))).toBe("firefox-esr");
    expect(nixTrackName(nix("firefox"))).toBe("firefox");
  });

  it("has none for another source or a nested attribute", () => {
    expect(nixTrackName({ source: "rpm-fedora", appId: "firefox-esr" })).toBeUndefined();
    expect(nixTrackName(nix("kdePackages.akregator"))).toBeUndefined();
  });
});

describe("annotateMembers for nixpkgs", () => {
  it("labels the ESR attributes of pname firefox with the esr track, not the stable ones", () => {
    const tracks = trackNames([
      { product: "firefox", track: "esr", names: ["firefox-esr"], reason: "ESR" },
    ]);
    const members = [
      nix("firefox"),
      nix("firefox-esr"),
      nix("firefox-esr-153"),
      nix("firefox-esr-unwrapped", "firefox-unwrapped"),
      nix("firefox-mobile"),
    ];

    const annotated = annotateMembers(members, (pkg) => pkg.name, tracks);

    expect(annotated.map((pkg) => pkg.track)).toEqual([undefined, "esr", "esr", "esr", undefined]);
  });
});
