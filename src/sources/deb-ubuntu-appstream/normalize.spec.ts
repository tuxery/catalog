import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { UbuntuAppstreamCacheEntry } from "./types";

const ENTRY: UbuntuAppstreamCacheEntry = {
  id: "org.gimp.gimp",
  component: "universe",
  pkgname: "gimp",
  name: "GIMP",
  summary: "Create images and edit photographs",
  iconUrl: "https://appstream.ubuntu.com/media/questing/org/gimp/gimp/icon.png",
  homepage: "https://www.gimp.org/",
  hasGameCategory: false,
  categories: ["Graphics", "2DGraphics", "RasterGraphics"],
  license: "GPL-3.0+",
  developer: "The GIMP team",
  longDescription: "GIMP is an advanced picture editor.",
  screenshots: ["https://appstream.ubuntu.com/media/questing/org/gimp/gimp/shot.png"],
  languages: ["en", "fr"],
};

describe("normalize", () => {
  it("maps a DEP-11 component to a SourcedPackage keyed by binary package name", () => {
    const packages = normalize([ENTRY]);

    expect(packages).toHaveLength(1);
    expect(packages[0]).toMatchObject({
      source: "deb-ubuntu-appstream",
      name: "GIMP",
      description: "Create images and edit photographs",
      version: "unknown",
      appId: "gimp",
      iconUrl: ENTRY.iconUrl,
      homepage: ENTRY.homepage,
      hasGameCategory: false,
      categories: ENTRY.categories,
      license: "GPL-3.0+",
      developer: "The GIMP team",
      longDescription: "GIMP is an advanced picture editor.",
      screenshots: ENTRY.screenshots,
      languages: ["en", "fr"],
    });
  });

  it("drops the screenshots key entirely when the component has none", () => {
    const packages = normalize([{ ...ENTRY, screenshots: [] }]);

    expect(packages[0]?.screenshots).toBeUndefined();
  });

  it("flags the game category the same way the Flatpak-family sources do", () => {
    const packages = normalize([{ ...ENTRY, hasGameCategory: true }]);

    expect(packages[0]?.hasGameCategory).toBe(true);
  });
});
