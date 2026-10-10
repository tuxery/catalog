import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import type { CatalogApp } from "../enrich/types";
import { attachFamilies } from "./index";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return { source: "pacman-aur", name: "x", description: "", version: "1", ...overrides };
}

function app(
  id: string,
  packages: SourcedPackage[],
  overrides: Partial<CatalogApp> = {},
): CatalogApp {
  return {
    id,
    name: packages[0]?.name ?? id,
    shortDescription: packages[0]?.description ?? "",
    packages,
    category: "To Classify",
    dataConfidence: { score: 0, signals: [] },
    ...overrides,
  };
}

const firefox = app("firefox", [
  pkg({
    source: "flatpak-flathub",
    name: "Firefox",
    appId: "org.mozilla.firefox",
    formal: { componentType: "desktop-application" },
  }),
  pkg({ source: "pacman-aur", name: "firefox-esr", appId: "firefox-esr" }),
  pkg({ source: "deb-debian", name: "firefox", appId: "firefox" }),
]);

describe("attachFamilies", () => {
  it("turns a group named after a product's companion into that product's companion", () => {
    const extension = app("pacman-aur:chromium-extension-dark-reader", [
      pkg({ name: "chromium-extension-dark-reader", description: "Dark mode for every website" }),
    ]);
    const chromium = app("chromium", [pkg({ name: "chromium", appId: "chromium" })]);

    const [companion, attached] = attachFamilies([extension, chromium], [], []);

    expect(companion?.companionOf).toBe("chromium");
    expect(attached?.companions).toEqual([
      {
        name: "chromium-extension-dark-reader",
        kind: "extension",
        description: "Dark mode for every website",
        packages: [{ source: "pacman-aur", name: "chromium-extension-dark-reader" }],
      },
    ]);
    expect(attached?.companionCounts).toEqual({ extension: 1 });
  });

  it("attaches loose packages: language packs by name, AppStream add-ons by <extends>, non-apps by Enhances", () => {
    const boxes = app("org.gnome.Boxes", [
      pkg({
        source: "flatpak-flathub",
        name: "Boxes",
        appId: "org.gnome.Boxes.desktop",
        formal: { componentType: "desktop-application" },
      }),
    ]);
    const emacs = app("emacs", [pkg({ source: "deb-debian", name: "emacs", appId: "emacs" })]);
    const loose = [
      pkg({ name: "firefox-esr-i18n-fr" }),
      pkg({
        source: "flatpak-flathub",
        name: "GNOME Boxes Osinfo DB",
        appId: "org.gnome.Boxes.Extension.OsinfoDb",
        formal: { componentType: "addon", extends: ["org.gnome.Boxes.desktop"] },
      }),
      pkg({ source: "deb-debian", name: "elpa-ace-window", formal: { enhances: ["emacs"] } }),
      pkg({
        source: "flatpak-flathub",
        name: "SDK extension",
        formal: { componentType: "addon", extends: ["org.freedesktop.Sdk"] },
      }),
    ];

    const [ff, gb, em] = attachFamilies([firefox, boxes, emacs], loose, []);

    expect(ff?.companions?.map((c) => `${c.kind}:${c.name}`)).toEqual([
      "localization:firefox-esr-i18n-fr",
    ]);
    expect(gb?.companions?.map((c) => `${c.kind}:${c.name}`)).toEqual([
      "plugin:GNOME Boxes Osinfo DB",
    ]);
    expect(em?.companions?.map((c) => `${c.kind}:${c.name}`)).toEqual(["plugin:elpa-ace-window"]);
  });

  it("never treats Enhances on a real app, an AppStream app, or a tool about companions as a companion", () => {
    const mutt = app("mutt", [pkg({ source: "deb-debian", name: "mutt", appId: "mutt" })]);
    const abook = app("deb-debian:abook", [
      pkg({ source: "deb-debian", name: "abook", appId: "abook", formal: { enhances: ["mutt"] } }),
    ]);
    const manager = app("com.mattjakeman.ExtensionManager", [
      pkg({ name: "firefox-extension-manager", formal: { componentType: "desktop-application" } }),
    ]);

    const themeManager = app("pacman-aur:kitty-theme-manager", [
      pkg({ name: "kitty-theme-manager" }),
    ]);
    const kitty = app("kitty", [pkg({ name: "kitty", appId: "kitty" })]);

    const result = attachFamilies([mutt, abook, firefox, manager, themeManager, kitty], [], []);

    expect(result.every((entry) => !entry.companionOf)).toBe(true);
  });

  it("lists a curated companion on its parent, AppStream app or not", () => {
    const syncthing = app("syncthing", [pkg({ name: "syncthing", appId: "syncthing" })]);
    const relay = app("syncthing-relay", [
      pkg({
        source: "flatpak-flathub",
        name: "Syncthing Relay",
        appId: "net.syncthing.Relay",
        description: "Relay server for Syncthing",
        formal: { componentType: "desktop-application" },
      }),
    ]);

    const [parent, companion] = attachFamilies(
      [syncthing, relay],
      [],
      [],
      [
        {
          parent: { source: "pacman-aur", appId: "syncthing" },
          companion: { source: "flatpak-flathub", appId: "net.syncthing.Relay" },
          kind: "component",
          reason: "test",
        },
      ],
    );

    expect(companion?.companionOf).toBe("syncthing");
    expect(parent?.companions?.map((entry) => entry.kind)).toEqual(["component"]);
    expect(parent?.companionCounts).toEqual({ component: 1 });
  });

  it("keeps a suite's member a card of its own, even when curated as a component", () => {
    const calligra = app("org.kde.calligra", [pkg({ name: "calligra", appId: "calligra" })]);
    const plan = app(
      "deb-debian:calligraplan",
      [pkg({ source: "deb-debian", name: "calligraplan", appId: "calligraplan" })],
      {
        suite: {
          id: "calligra",
          name: "Calligra",
          role: "component",
          mainApp: { id: "org.kde.calligra", name: "Calligra" },
        },
      },
    );

    const [parent, member] = attachFamilies(
      [calligra, plan],
      [],
      [],
      [
        {
          parent: { source: "pacman-aur", appId: "calligra" },
          companion: { source: "deb-debian", appId: "calligraplan" },
          kind: "component",
          reason: "test",
        },
      ],
    );

    expect(member?.companionOf).toBeUndefined();
    expect(parent?.companions).toBeUndefined();
  });

  it("links curated relations both ways", () => {
    const librewolf = app("io.gitlab.librewolf-community", [
      pkg({ source: "flatpak-flathub", name: "LibreWolf", appId: "io.gitlab.librewolf-community" }),
    ]);

    const [ff, lw] = attachFamilies(
      [firefox, librewolf],
      [],
      [
        {
          type: "forkOf",
          from: { source: "flatpak-flathub", appId: "io.gitlab.librewolf-community" },
          to: { source: "flatpak-flathub", appId: "org.mozilla.firefox" },
          reason: "test",
        },
      ],
    );

    expect(lw?.relations).toEqual([
      {
        type: "forkOf",
        direction: "outgoing",
        app: { id: "firefox", name: "Firefox" },
        origin: "curated",
      },
    ]);
    expect(ff?.relations).toEqual([
      {
        type: "forkOf",
        direction: "incoming",
        app: { id: "io.gitlab.librewolf-community", name: "LibreWolf" },
        origin: "curated",
      },
    ]);
  });
});
