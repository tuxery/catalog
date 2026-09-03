import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import type { DebianAppstreamCacheEntry } from "./types";

const ENTRY: DebianAppstreamCacheEntry = {
  id: "org.gnome.gitg",
  component: "main",
  pkgname: "gitg",
  name: "gitg",
  summary: "Graphical user interface for git",
  iconUrl: "https://appstream.debian.org/media/trixie/org/gnome/gitg/8f3ac/icons/128x128/gitg.png",
  homepage: "https://wiki.gnome.org/Apps/Gitg",
  hasGameCategory: false,
  categories: ["Development", "RevisionControl"],
  license: "GPL-2.0+",
  developer: "The gitg team",
  longDescription: "gitg is a graphical user interface for git.",
  screenshots: ["https://appstream.debian.org/media/trixie/org/gnome/gitg/8f3ac/shot.png"],
  languages: ["as", "bg"],
};

describe("normalize", () => {
  it("maps a DEP-11 component to a SourcedPackage keyed by binary package name", () => {
    const packages = normalize([ENTRY]);

    expect(packages).toHaveLength(1);
    expect(packages[0]).toMatchObject({
      source: "deb-debian-appstream",
      name: "gitg",
      description: "Graphical user interface for git",
      version: "unknown",
      appId: "gitg",
      iconUrl: ENTRY.iconUrl,
      homepage: ENTRY.homepage,
      hasGameCategory: false,
      categories: ["Development", "RevisionControl"],
      license: "GPL-2.0+",
      developer: "The gitg team",
      longDescription: "gitg is a graphical user interface for git.",
      screenshots: [ENTRY.screenshots?.[0]],
      languages: ["as", "bg"],
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
