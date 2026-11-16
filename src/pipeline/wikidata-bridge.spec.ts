import { unorderedPairKey } from "helpers4/string";
import { describe, expect, it } from "vitest";
import type { WikidataCacheEntry } from "../sources/wikidata";
import { bridgeWikidata, type BridgeApp, type BridgeOverrides } from "./wikidata-bridge";

const NONE: BridgeOverrides = { force: [], denyPairs: new Set(), apart: [] };

function app(
  id: string,
  packages: BridgeApp["packages"],
  extra: Partial<BridgeApp> = {},
): BridgeApp {
  return { id, name: id, packages, ...extra };
}

const pkg = (
  source: string,
  appId: string,
  extra: Partial<BridgeApp["packages"][number]> = {},
): BridgeApp["packages"][number] =>
  ({ source, appId, name: appId, ...extra }) as BridgeApp["packages"][number];

describe("bridgeWikidata", () => {
  it("suggests a match-force entry when one item links two of our groups", () => {
    const apps = [
      app("org.gnome.Boxes.desktop", [
        pkg("flatpak-flathub", "org.gnome.Boxes.desktop", {
          homepage: "https://apps.gnome.org/Boxes/",
        }),
      ]),
      app("pacman-arch:gnome-boxes", [
        pkg("pacman-arch", "gnome-boxes", { homepage: "https://apps.gnome.org/Boxes" }),
        pkg("deb-debian", "gnome-boxes"),
      ]),
    ];
    const items: WikidataCacheEntry[] = [
      {
        qid: "Q1",
        label: "GNOME Boxes",
        packages: { P4655: ["org.gnome.Boxes"], P3454: ["gnome-boxes"] },
      },
    ];
    const result = bridgeWikidata(apps, items, NONE);
    expect(result.splits).toHaveLength(1);
    const [split] = result.splits;
    expect(split?.homepage).toBe("agree");
    expect(split?.entry.destination).toEqual({
      source: "flatpak-flathub",
      appId: "org.gnome.Boxes.desktop",
    });
    expect(split?.entry.sources).toEqual([{ source: "pacman-arch", appId: "gnome-boxes" }]);
    expect(result.properties.P4655).toEqual({ statements: 1, resolved: 1, resolvedViaBase: 0 });
  });

  it("matches a source package name only when its binaries sit in one group", () => {
    const apps = [
      app("rpm-fedora:writer", [
        pkg("rpm-fedora", "libreoffice-writer", { formal: { base: "libreoffice" } }),
      ]),
      app("rpm-fedora:calc", [
        pkg("rpm-fedora", "libreoffice-calc", { formal: { base: "libreoffice" } }),
      ]),
      app("rpm-fedora:gimp", [pkg("rpm-fedora", "gimp-libs", { formal: { base: "gimp" } })]),
    ];
    const items: WikidataCacheEntry[] = [
      { qid: "Q2", packages: { P3463: ["libreoffice"] } },
      { qid: "Q3", packages: { P3463: ["gimp"] } },
    ];
    const result = bridgeWikidata(apps, items, NONE);
    expect(result.properties.P3463).toEqual({ statements: 2, resolved: 1, resolvedViaBase: 1 });
  });

  it("flags groups a curated deny pair or a relation already keeps apart", () => {
    const apps = [
      app("a", [pkg("pacman-aur", "foo")], { relations: [{ app: { id: "b" } }] }),
      app("b", [pkg("deb-debian", "foo-ng")]),
      app("c", [pkg("pacman-arch", "bar")]),
      app("d", [pkg("apk-alpine", "bar2")]),
    ];
    const items: WikidataCacheEntry[] = [
      { qid: "Q4", packages: { P4162: ["foo"], P3442: ["foo-ng"] } },
      { qid: "Q5", packages: { P3454: ["bar"], P9045: ["bar2"] } },
    ];
    const denyPairs = new Set([unorderedPairKey("pacman-arch:bar", "apk-alpine:bar2")]);
    const result = bridgeWikidata(apps, items, { ...NONE, denyPairs });
    expect(
      result.splits.map((split) => [split.item.qid, split.related, split.curatedApart]),
    ).toEqual([
      ["Q4", true, false],
      ["Q5", false, true],
    ]);
  });

  it("suggests a match-apart entry when two items link packages of one group", () => {
    const apps = [
      app("dolphin", [
        pkg("deb-debian", "dolphin"),
        pkg("ebuild-gentoo", "games-emulation/dolphin"),
        pkg("ebuild-gentoo", "kde-apps/dolphin"),
      ]),
    ];
    const items: WikidataCacheEntry[] = [
      {
        qid: "Q6",
        label: "Dolphin",
        packages: { P3442: ["dolphin"], P3499: ["kde-apps/dolphin"] },
        websites: ["https://apps.kde.org/dolphin/"],
      },
      {
        qid: "Q7",
        label: "Dolphin emulator",
        packages: { P3499: ["games-emulation/dolphin"] },
        websites: ["https://dolphin-emu.org/"],
      },
    ];
    const result = bridgeWikidata(apps, items, NONE);
    expect(result.splits).toEqual([]);
    expect(result.aparts).toHaveLength(1);
    expect(result.aparts[0]?.sameWebsite).toBe(false);
    expect(result.aparts[0]?.entries).toEqual([
      {
        a: [
          { source: "deb-debian", appId: "dolphin" },
          { source: "ebuild-gentoo", appId: "kde-apps/dolphin" },
        ],
        b: [{ source: "ebuild-gentoo", appId: "games-emulation/dolphin" }],
        reason: "Different software per Wikidata: Q6 (Dolphin) and Q7 (Dolphin emulator).",
      },
    ]);
  });

  it("counts what P856 and P154 could fill on groups one item links alone", () => {
    const apps = [
      app("x", [pkg("apk-alpine", "x")]),
      app("y", [pkg("apk-alpine", "y")], { homepage: "https://y.org", iconUrl: "y.png" }),
    ];
    const items: WikidataCacheEntry[] = [
      { qid: "Q8", packages: { P9045: ["x"] }, websites: ["https://x.org"], logos: ["X.svg"] },
      { qid: "Q9", packages: { P9045: ["y"] }, websites: ["https://other.org"] },
    ];
    expect(bridgeWikidata(apps, items, NONE).gaps).toEqual({
      linkedGroups: 2,
      withoutHomepage: 1,
      withoutHomepageItemHasWebsite: 1,
      homepageDiffers: 1,
      withoutIcon: 1,
      withoutIconItemHasLogo: 1,
    });
  });
  it("keeps a property with several values out of the entry, and prefers an official package to the AUR's", () => {
    const apps = [
      app("git", [
        pkg("pacman-arch", "git"),
        pkg("pacman-aur", "git-git"),
        pkg("deb-debian", "git"),
      ]),
      app("git-gui", [pkg("deb-debian", "git-gui")]),
      app("lua5.1", [pkg("deb-debian", "lua5.1")]),
      app("lua5.4", [pkg("deb-debian", "lua5.4")]),
    ];
    const items: WikidataCacheEntry[] = [
      { qid: "Q10", packages: { P4162: ["git-git"], P3454: ["git"], P3442: ["git", "git-gui"] } },
      { qid: "Q11", packages: { P3442: ["lua5.1", "lua5.4"] } },
    ];
    const [git, lua] = bridgeWikidata(apps, items, NONE).splits;
    // Git: only one group has a single-valued link, so nothing to merge on that basis.
    expect(git?.severalValuesOnly).toBe(true);
    expect(lua?.severalValuesOnly).toBe(true);

    const twm = bridgeWikidata(
      [
        app("twm", [pkg("deb-debian", "twm")]),
        app("xorg-twm", [pkg("pacman-aur", "xorg-twm-git"), pkg("pacman-arch", "xorg-twm")]),
      ],
      [{ qid: "Q12", packages: { P3442: ["twm"], P4162: ["xorg-twm-git"], P3454: ["xorg-twm"] } }],
      NONE,
    ).splits[0];
    expect(twm?.severalValuesOnly).toBe(false);
    expect(twm?.entry.destination).toEqual({ source: "pacman-arch", appId: "xorg-twm" });
    expect(twm?.entry.sources).toEqual([{ source: "deb-debian", appId: "twm" }]);
    expect(twm?.groups.map((group) => [group.id, group.repositories])).toEqual([
      ["xorg-twm", 2],
      ["twm", 1],
    ]);
  });

  it("marks sides that differ by track as merged on purpose", () => {
    const apps = [
      app("firefox", [
        pkg("pacman-arch", "firefox"),
        pkg("deb-debian", "firefox-esr", { track: "esr" }),
        pkg("deb-debian-appstream", "firefox-esr"),
      ]),
    ];
    const items: WikidataCacheEntry[] = [
      { qid: "Q698", packages: { P3454: ["firefox"] } },
      { qid: "Q13", packages: { P3442: ["firefox-esr"] } },
    ];
    expect(bridgeWikidata(apps, items, NONE).aparts[0]?.tracks).toBe(true);
  });
});
