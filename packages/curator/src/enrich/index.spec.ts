import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "@tuxery/sources";
import type { MatchedApp } from "../match/group";
import { enrichApps } from "./index";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return {
    source: "flatpak-flathub",
    name: "Example",
    description: "An example package.",
    version: "1.0.0",
    ...overrides,
  };
}

describe("enrichApps", () => {
  it("uses the sole package's fields for a single-source group", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:org.example.solo",
        packages: [
          pkg({
            name: "Solo",
            description: "The only source.",
            homepage: "https://example.com",
            appId: "org.example.solo",
          }),
        ],
      },
    ];

    const [app] = enrichApps(matched);

    expect(app).toMatchObject({
      id: "flathub:org.example.solo",
      name: "Solo",
      shortDescription: "The only source.",
      homepage: "https://example.com",
    });
    expect(app?.packages).toHaveLength(1);
  });

  it("prefers Flathub over native sources for display fields", () => {
    const matched: MatchedApp[] = [
      {
        id: "aur:example",
        packages: [
          pkg({ source: "pacman-aur", name: "example", description: "terse packager description" }),
          pkg({
            source: "flatpak-flathub",
            name: "Example",
            description: "Human-readable summary.",
          }),
        ],
      },
    ];

    const [app] = enrichApps(matched);

    expect(app?.name).toBe("Example");
    expect(app?.shortDescription).toBe("Human-readable summary.");
    expect(app?.packages).toHaveLength(2);
  });

  it("prefers Snapcraft over other native sources when Flathub is absent", () => {
    const matched: MatchedApp[] = [
      {
        id: "aur:example",
        packages: [
          pkg({ source: "pacman-aur", name: "example", description: "terse" }),
          pkg({ source: "snap-snapcraft", name: "Example", description: "Snap summary." }),
        ],
      },
    ];

    const [app] = enrichApps(matched);

    expect(app?.name).toBe("Example");
    expect(app?.shortDescription).toBe("Snap summary.");
  });

  it("falls back to the first package when no priority source is present", () => {
    const matched: MatchedApp[] = [
      {
        id: "aur:example",
        packages: [
          pkg({ source: "pacman-aur", name: "example-aur", description: "aur desc" }),
          pkg({ source: "deb-debian", name: "example-debian", description: "debian desc" }),
        ],
      },
    ];

    const [app] = enrichApps(matched);

    expect(app?.name).toBe("example-aur");
  });

  it("falls back to a lower-priority source's description when the priority source's is blank", () => {
    const matched: MatchedApp[] = [
      {
        id: "appimage:Dygmalab/Bazecor",
        packages: [
          pkg({ source: "appimage", name: "Bazecor", description: "" }),
          pkg({
            source: "pacman-aur",
            name: "bazecor",
            description: "Graphical configurator for Dygma keyboards",
          }),
        ],
      },
    ];

    const [app] = enrichApps(matched);

    // Name/homepage still come from the priority source (appimage), only
    // the description falls back — see pickDescription's doc comment.
    expect(app?.name).toBe("Bazecor");
    expect(app?.shortDescription).toBe("Graphical configurator for Dygma keyboards");
  });

  it("uses an empty description when no package in the group has one", () => {
    const matched: MatchedApp[] = [
      {
        id: "appimage:example",
        packages: [pkg({ source: "appimage", name: "Example", description: "" })],
      },
    ];

    const [app] = enrichApps(matched);

    expect(app?.shortDescription).toBe("");
  });

  it("sets kind to gui when any member package has hasDesktopFile", () => {
    const matched: MatchedApp[] = [
      {
        id: "fedora:0ad",
        packages: [
          pkg({ source: "pacman-aur", name: "0ad" }),
          pkg({ source: "rpm-fedora", name: "0ad", hasDesktopFile: true }),
        ],
      },
    ];

    expect(enrichApps(matched)[0]?.kind).toBe("gui");
  });

  it("leaves kind undefined when no member package has hasDesktopFile evidence", () => {
    const matched: MatchedApp[] = [
      {
        id: "aur:example",
        packages: [pkg({ source: "pacman-aur", name: "example" })],
      },
    ];

    expect(enrichApps(matched)[0]?.kind).toBeUndefined();
  });

  it("sets kind to gui from Debian/Ubuntu's Section heuristic when no hasDesktopFile evidence exists", () => {
    const matched: MatchedApp[] = [
      {
        id: "debian:abiword",
        packages: [pkg({ source: "deb-debian", name: "abiword", section: "editors" })],
      },
    ];

    expect(enrichApps(matched)[0]?.kind).toBe("gui");
  });

  it("does not apply the Debian/Ubuntu Section heuristic to other sources reusing the same section slot", () => {
    const matched: MatchedApp[] = [
      {
        id: "gentoo:example",
        packages: [pkg({ source: "ebuild-gentoo", name: "example", section: "games-strategy" })],
      },
    ];

    expect(enrichApps(matched)[0]?.kind).toBeUndefined();
  });

  it("sets contentType to game from Flathub/AppCenter's direct hasGameCategory signal", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:0ad",
        packages: [pkg({ source: "flatpak-flathub", name: "0 A.D.", hasGameCategory: true })],
      },
    ];

    expect(enrichApps(matched)[0]?.contentType).toBe("game");
  });

  it("sets contentType to game from the Section-based heuristic when no hasGameCategory evidence exists", () => {
    const matched: MatchedApp[] = [
      {
        id: "gentoo:0ad",
        packages: [pkg({ source: "ebuild-gentoo", name: "0ad", section: "games-strategy" })],
      },
    ];

    expect(enrichApps(matched)[0]?.contentType).toBe("game");
  });

  it("leaves contentType undefined when no member package has game evidence", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:example",
        packages: [pkg({ source: "flatpak-flathub", name: "example", hasGameCategory: false })],
      },
    ];

    expect(enrichApps(matched)[0]?.contentType).toBeUndefined();
  });

  it("evaluates kind and contentType independently — a GUI app group isn't assumed to be a game", () => {
    const matched: MatchedApp[] = [
      {
        id: "fedora:gimp",
        packages: [pkg({ source: "rpm-fedora", name: "gimp", hasDesktopFile: true })],
      },
    ];

    const [app] = enrichApps(matched);
    expect(app?.kind).toBe("gui");
    expect(app?.contentType).toBeUndefined();
  });

  it("carries the full packages array through unchanged", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", appId: "org.example.a" }),
      pkg({ source: "snap-snapcraft", appId: "example" }),
    ];
    const matched: MatchedApp[] = [{ id: "flathub:org.example.a", packages }];

    const [app] = enrichApps(matched);

    expect(app?.packages).toBe(packages);
  });

  it("sets category from the representative package's categories", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:gimp",
        packages: [pkg({ source: "flatpak-flathub", name: "GIMP", categories: ["Graphics"] })],
      },
    ];

    expect(enrichApps(matched)[0]?.category).toBe("Graphics & Creativity");
  });

  it("falls back to a non-representative package's categories when the representative has none", () => {
    // AppCenter isn't in SOURCE_PRIORITY, so Snapcraft wins as
    // representative here — but only AppCenter carries category data.
    const matched: MatchedApp[] = [
      {
        id: "snap:example",
        packages: [
          pkg({ source: "snap-snapcraft", name: "example" }),
          pkg({ source: "flatpak-appcenter", name: "example", categories: ["Office"] }),
        ],
      },
    ];

    expect(enrichApps(matched)[0]?.category).toBe("Productivity");
  });

  it("leaves category undefined when no member package has category data", () => {
    const matched: MatchedApp[] = [
      { id: "aur:example", packages: [pkg({ source: "pacman-aur", name: "example" })] },
    ];

    expect(enrichApps(matched)[0]?.category).toBeUndefined();
  });

  it("leaves category undefined for a Game-only package — contentType covers that, not category", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:example",
        packages: [
          pkg({
            source: "flatpak-flathub",
            name: "example",
            hasGameCategory: true,
            categories: ["Game"],
          }),
        ],
      },
    ];

    const [app] = enrichApps(matched);
    expect(app?.contentType).toBe("game");
    expect(app?.category).toBeUndefined();
  });

  it("sets iconUrl, license, developer, longDescription, and screenshots from the representative package", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:example",
        packages: [
          pkg({
            source: "flatpak-flathub",
            iconUrl: "https://dl.flathub.org/media/example/icon.png",
            license: "GPL-3.0+",
            developer: "Example Team",
            longDescription: "A longer description.",
            screenshots: ["https://dl.flathub.org/media/example/1.png"],
          }),
        ],
      },
    ];

    const [app] = enrichApps(matched);
    expect(app?.iconUrl).toBe("https://dl.flathub.org/media/example/icon.png");
    expect(app?.license).toBe("GPL-3.0+");
    expect(app?.developer).toBe("Example Team");
    expect(app?.longDescription).toBe("A longer description.");
    expect(app?.screenshots).toEqual(["https://dl.flathub.org/media/example/1.png"]);
  });

  it("falls back to a non-representative package's rich fields, same as category — AppCenter isn't in SOURCE_PRIORITY either", () => {
    const matched: MatchedApp[] = [
      {
        id: "snap:example",
        packages: [
          pkg({ source: "snap-snapcraft", name: "example" }),
          pkg({
            source: "flatpak-appcenter",
            name: "example",
            license: "MIT",
            developer: "AppCenter Dev",
          }),
        ],
      },
    ];

    const [app] = enrichApps(matched);
    expect(app?.license).toBe("MIT");
    expect(app?.developer).toBe("AppCenter Dev");
  });

  it("leaves rich fields undefined when no member package has them, never guessed", () => {
    const matched: MatchedApp[] = [
      { id: "aur:example", packages: [pkg({ source: "pacman-aur", name: "example" })] },
    ];

    const [app] = enrichApps(matched);
    expect(app?.iconUrl).toBeUndefined();
    expect(app?.license).toBeUndefined();
    expect(app?.developer).toBeUndefined();
    expect(app?.longDescription).toBeUndefined();
    expect(app?.screenshots).toBeUndefined();
  });

  it("leaves screenshots undefined (not an empty array) when a member package's screenshots array is empty", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:example",
        packages: [pkg({ source: "flatpak-flathub", screenshots: [] })],
      },
    ];

    expect(enrichApps(matched)[0]?.screenshots).toBeUndefined();
  });

  it("combines every member package's rating into one count-weighted average", () => {
    const matched: MatchedApp[] = [
      {
        id: "gog:firewatch",
        packages: [
          pkg({ source: "gog", rating: { average: 4, count: 100 } }),
          pkg({ source: "lutris", rating: { average: 2, count: 50 } }),
        ],
      },
    ];

    // (4*100 + 2*50) / 150 = 3.333...
    expect(enrichApps(matched)[0]?.rating).toEqual({ average: 500 / 150, count: 150 });
  });

  it("leaves rating undefined when no member package has one, never a synthetic 0", () => {
    const matched: MatchedApp[] = [
      { id: "aur:example", packages: [pkg({ source: "pacman-aur", name: "example" })] },
    ];

    expect(enrichApps(matched)[0]?.rating).toBeUndefined();
  });

  it("ignores a rating with a zero count rather than folding it into the average", () => {
    const matched: MatchedApp[] = [
      {
        id: "gog:example",
        packages: [pkg({ source: "gog", rating: { average: 0, count: 0 } })],
      },
    ];

    expect(enrichApps(matched)[0]?.rating).toBeUndefined();
  });

  it("averages every member package's popularity score", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:example",
        packages: [
          pkg({ source: "flatpak-flathub", popularity: 1 }),
          pkg({ source: "pacman-aur", popularity: 0.5 }),
        ],
      },
    ];

    expect(enrichApps(matched)[0]?.popularity).toBe(0.75);
  });

  it("leaves popularity undefined when no member package has a score", () => {
    const matched: MatchedApp[] = [
      { id: "aur:example", packages: [pkg({ source: "pacman-aur", name: "example" })] },
    ];

    expect(enrichApps(matched)[0]?.popularity).toBeUndefined();
  });

  it("applies injected suite overrides across the whole enriched batch", () => {
    const matched: MatchedApp[] = [
      { id: "flatpak-flathub:org.example.Suite", packages: [pkg({ name: "Suite" })] },
      {
        id: "deb-debian:suite-writer",
        packages: [pkg({ source: "deb-debian", name: "suite-writer" })],
      },
    ];

    const apps = enrichApps(matched, [
      {
        suiteId: "example-suite",
        suiteName: "Example Suite",
        mainAppId: "flatpak-flathub:org.example.Suite",
        components: [{ appId: "deb-debian:suite-writer", name: "Example Writer" }],
        reason: "test",
      },
    ]);

    expect(apps.find((app) => app.id === "flatpak-flathub:org.example.Suite")?.suite?.role).toBe(
      "main",
    );
    expect(apps.find((app) => app.id === "deb-debian:suite-writer")?.suite?.role).toBe("component");
  });

  it("leaves suite undefined when no override is passed (defaults to the real overrides file, which won't match synthetic ids)", () => {
    const matched: MatchedApp[] = [
      { id: "aur:example", packages: [pkg({ source: "pacman-aur", name: "example" })] },
    ];

    expect(enrichApps(matched)[0]?.suite).toBeUndefined();
  });
});
