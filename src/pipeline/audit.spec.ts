import { describe, expect, it } from "vitest";
import type { CatalogApp } from "../curator";
import type { SourcedPackage } from "../sources";
import {
  checkGolden,
  declaredRelationSuspects,
  generateGolden,
  homepageKey,
  nameKey,
  sharedHomepageSuspects,
} from "./audit";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return { source: "deb-debian", name: "x", description: "", version: "1", ...overrides };
}

function app(
  id: string,
  packages: SourcedPackage[],
  overrides: Partial<CatalogApp> = {},
): CatalogApp {
  return {
    id,
    name: id,
    shortDescription: "",
    packages,
    category: "To Classify",
    dataConfidence: { score: 0, signals: [] },
    ...overrides,
  };
}

describe("homepageKey", () => {
  it("keeps the project part of a homepage", () => {
    expect(homepageKey("https://www.videolan.org/vlc/")).toBe("videolan.org/vlc");
    expect(homepageKey("https://github.com/Owner/Repo/releases?x=1")).toBe("github.com/owner/repo");
    expect(homepageKey("https://github.com/owner/repo.git")).toBe("github.com/owner/repo");
  });

  it("ignores bare code hosts and distribution package pages", () => {
    expect(homepageKey("https://github.com/owner")).toBeUndefined();
    expect(homepageKey("https://aur.archlinux.org/packages/foo")).toBeUndefined();
    expect(homepageKey(undefined)).toBeUndefined();
  });
});

describe("nameKey", () => {
  it("ignores punctuation and a trailing build word", () => {
    expect(nameKey("amneziavpn-bin")).toBe(nameKey("amnezia-vpn-bin"));
    expect(nameKey("Ultimaker Cura")).toBe("ultimakercura");
  });
});

describe("sharedHomepageSuspects", () => {
  it("lists published groups sharing a project homepage under tied names", () => {
    const suspects = sharedHomepageSuspects([
      app("vlc", [pkg({ name: "vlc", homepage: "https://www.videolan.org/vlc/" })], {
        installsTotal: 10,
      }),
      app("deb-debian:vlc-bin", [pkg({ name: "vlc-bin", homepage: "https://videolan.org/vlc" })]),
      app("other", [pkg({ name: "other", homepage: "https://example.org" })]),
    ]);

    expect(suspects).toHaveLength(1);
    expect(suspects[0]?.key).toBe("videolan.org/vlc");
    expect(suspects[0]?.apps.map((entry) => entry.id)).toEqual(["vlc", "deb-debian:vlc-bin"]);
  });

  it("leaves out a publisher's unrelated products under one site", () => {
    expect(
      sharedHomepageSuspects([
        app("firefox", [pkg({ name: "firefox", homepage: "https://mozilla.org" })]),
        app("thunderbird", [pkg({ name: "thunderbird", homepage: "https://mozilla.org" })]),
      ]),
    ).toEqual([]);
  });
});

describe("golden set", () => {
  const firefox = app(
    "firefox",
    [
      pkg({ source: "flatpak-flathub", name: "Firefox", appId: "org.mozilla.firefox" }),
      pkg({ source: "deb-ubuntu", name: "firefox", appId: "firefox" }),
      pkg({ source: "pacman-aur", name: "firefox-bin", appId: "firefox-bin", flavors: ["bin"] }),
    ],
    { name: "Firefox", installsTotal: 100 },
  );

  it("anchors a generated entry on the major platforms' default builds", () => {
    expect(generateGolden([firefox], 10)).toEqual([
      {
        product: "Firefox",
        anchors: [
          { source: "flatpak-flathub", appId: "org.mozilla.firefox" },
          { source: "deb-ubuntu", appId: "firefox" },
        ],
      },
    ]);
  });

  it("reports a split product, two products in one group, and a vanished anchor", () => {
    const golden = [
      {
        product: "Firefox",
        anchors: [
          { source: "flatpak-flathub", appId: "org.mozilla.firefox" },
          { source: "deb-ubuntu", appId: "firefox" },
        ],
      },
      { product: "Ubuntu Firefox", anchors: [{ source: "deb-ubuntu", appId: "firefox" }] },
      { product: "Gone", anchors: [{ source: "snap-snapcraft", appId: "gone" }] },
    ];
    const split = [
      app("firefox", [firefox.packages[0] as SourcedPackage]),
      app("deb-ubuntu:firefox", [firefox.packages[1] as SourcedPackage]),
    ];

    expect(checkGolden(split, golden).map((violation) => violation.kind)).toEqual([
      "split",
      "merged",
      "missing",
    ]);
    expect(checkGolden([firefox], golden.slice(0, 1))).toEqual([]);
  });
});

describe("declaredRelationSuspects", () => {
  it("reads a relation a description states and resolves its target", () => {
    const wine = app("org.winehq.Wine", [pkg({ name: "wine" })], { name: "Wine" });
    const proton = app("pacman-aur:wine-proton", [pkg({ name: "wine-proton" })], {
      name: "wine-proton",
      shortDescription: "Valve Software's fork of Wine",
    });
    const [found] = declaredRelationSuspects([wine, proton]);

    expect(found?.relation).toEqual({ type: "forkOf", quote: "fork of Wine" });
    expect(found?.apps.map((entry) => entry.id)).toEqual([
      "pacman-aur:wine-proton",
      "org.winehq.Wine",
    ]);
  });

  it("ignores platforms and desktops as targets", () => {
    const gnome = app("deb-debian:gnome", [pkg({ name: "gnome" })], { name: "gnome" });
    const dialect = app("dialect", [pkg({ name: "dialect" })], {
      shortDescription: "A translation app for GNOME",
    });
    expect(declaredRelationSuspects([gnome, dialect])).toEqual([]);
  });
});
