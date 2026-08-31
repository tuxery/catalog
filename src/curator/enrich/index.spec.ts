import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import type { MatchedApp } from "../match/group";
import { TO_CLASSIFY } from "./category";
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

  it("sets appStoreFrontend to true when a member package is on the hand-curated list, undefined otherwise", () => {
    const frontend: MatchedApp[] = [
      {
        id: "deb-debian:gnome-software",
        packages: [pkg({ source: "deb-debian", name: "gnome-software" })],
      },
    ];
    const notFrontend: MatchedApp[] = [
      { id: "flathub:firefox", packages: [pkg({ source: "flatpak-flathub", name: "Firefox" })] },
    ];

    expect(enrichApps(frontend)[0]?.appStoreFrontend).toBe(true);
    expect(enrichApps(notFrontend)[0]?.appStoreFrontend).toBeUndefined();
  });

  it("sets compatibilityWarnings, scoped to the affected source only, when a member package is on the hand-curated list", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:boxes",
        packages: [
          pkg({ source: "snap-snapcraft", name: "GNOME Boxes" }),
          pkg({ source: "flatpak-flathub", name: "Boxes" }),
          pkg({ source: "deb-debian", name: "gnome-boxes" }),
        ],
      },
    ];

    const warnings = enrichApps(matched)[0]?.compatibilityWarnings;
    expect(warnings).toHaveLength(2);
    const sources = warnings?.map((w) => w.source) ?? [];
    // oxlint-disable-next-line unicorn/no-array-sort -- `sources` is a fresh array; toSorted needs ES2023 lib
    expect(sources.sort()).toEqual(["flatpak-flathub", "snap-snapcraft"]);
    // The unaffected deb-debian source shouldn't carry a warning of its own.
    expect(warnings?.some((w) => w.source === "deb-debian")).toBe(false);
  });

  it("leaves compatibilityWarnings undefined for an app with no known issue", () => {
    const matched: MatchedApp[] = [
      { id: "flathub:firefox", packages: [pkg({ source: "flatpak-flathub", name: "Firefox" })] },
    ];

    expect(enrichApps(matched)[0]?.compatibilityWarnings).toBeUndefined();
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

    expect(enrichApps(matched)[0]?.category).toBe("Graphics & Design");
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

  it("falls back to To Classify when no member package has category data", () => {
    const matched: MatchedApp[] = [
      { id: "aur:example", packages: [pkg({ source: "pacman-aur", name: "example" })] },
    ];

    expect(enrichApps(matched)[0]?.category).toBe(TO_CLASSIFY);
  });

  it("falls back to To Classify for a Game-tagged package with no recognized genre", () => {
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
    expect(app?.category).toBe(TO_CLASSIFY);
  });

  it("falls back to a category-rules.json name-pattern match when no member package has any category data", () => {
    const matched: MatchedApp[] = [
      {
        id: "aur:proton-cachyos-native",
        packages: [pkg({ source: "pacman-aur", name: "proton-cachyos-native" })],
      },
    ];

    expect(enrichApps(matched)[0]?.category).toBe("Utilities");
  });

  it("prefers real upstream category data over a category-rules.json name match", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:proton-something",
        packages: [
          pkg({ source: "flatpak-flathub", name: "proton-something", categories: ["Science"] }),
        ],
      },
    ];

    expect(enrichApps(matched)[0]?.category).toBe("Science");
  });

  it("does not apply a category-rules.json name match to a game — the ruleset only ever holds app-taxonomy labels", () => {
    const matched: MatchedApp[] = [
      {
        id: "aur:proton-game",
        packages: [pkg({ source: "pacman-aur", name: "proton-game", hasGameCategory: true })],
      },
    ];

    const [app] = enrichApps(matched);
    expect(app?.contentType).toBe("game");
    expect(app?.category).toBe(TO_CLASSIFY);
  });

  it("falls back to a Debian/Ubuntu Section-based category when no upstream category and no category-rules.json name match exist", () => {
    const matched: MatchedApp[] = [
      {
        id: "debian:obs-studio",
        packages: [pkg({ source: "deb-debian", name: "OBS Studio", section: "video" })],
      },
    ];

    expect(enrichApps(matched)[0]?.category).toBe("Photo & Video");
  });

  it("prefers a category-rules.json name match over a Debian Section-based one", () => {
    const matched: MatchedApp[] = [
      {
        id: "deb-debian:proton-something",
        packages: [pkg({ source: "deb-debian", name: "proton-something", section: "video" })],
      },
    ];

    expect(enrichApps(matched)[0]?.category).toBe("Utilities");
  });

  it("does not apply a Debian Section-based category match to a game", () => {
    const matched: MatchedApp[] = [
      {
        id: "deb-debian:example-game",
        packages: [
          pkg({ source: "deb-debian", name: "example", section: "video", hasGameCategory: true }),
        ],
      },
    ];

    const [app] = enrichApps(matched);
    expect(app?.contentType).toBe("game");
    expect(app?.category).toBe(TO_CLASSIFY);
  });

  it("maps a Game-tagged package's genre through the game taxonomy, not the app one", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:example-strategy",
        packages: [
          pkg({
            source: "flatpak-flathub",
            name: "example",
            hasGameCategory: true,
            categories: ["Game", "StrategyGame"],
          }),
        ],
      },
    ];

    const [app] = enrichApps(matched);
    expect(app?.contentType).toBe("game");
    expect(app?.category).toBe("Strategy");
  });

  it("sets iconUrl, license, developer, longDescription, screenshots, languages, changelog, and approxSizeBytes from the representative package", () => {
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
            languages: ["en_US", "fr"],
            changelog: "Fixed a crash on startup.",
            approxSizeBytes: 125_546_324,
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
    expect(app?.languages).toEqual(["en_US", "fr"]);
    expect(app?.changelog).toBe("Fixed a crash on startup.");
    expect(app?.approxSizeBytes).toBe(125_546_324);
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
    expect(app?.languages).toBeUndefined();
    expect(app?.changelog).toBeUndefined();
  });

  it("leaves screenshots/languages undefined (not an empty array) when a member package's array is empty", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:example",
        packages: [pkg({ source: "flatpak-flathub", screenshots: [], languages: [] })],
      },
    ];

    const [app] = enrichApps(matched);
    expect(app?.screenshots).toBeUndefined();
    expect(app?.languages).toBeUndefined();
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

  it("unions store-collection tags across member packages, deduplicated", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:example",
        packages: [
          pkg({ source: "flatpak-flathub", storeCollections: ["verified", "recently-updated"] }),
          pkg({ source: "snap-snapcraft", storeCollections: ["featured", "verified"] }),
        ],
      },
    ];

    expect(enrichApps(matched)[0]?.storeCollections).toEqual([
      "verified",
      "recently-updated",
      "featured",
    ]);
  });

  it("leaves storeCollections undefined when no member package has any tag", () => {
    const matched: MatchedApp[] = [
      { id: "aur:example", packages: [pkg({ source: "pacman-aur", name: "example" })] },
    ];

    expect(enrichApps(matched)[0]?.storeCollections).toBeUndefined();
  });

  it("picks the most recent lastUpdated across member packages, not the highest-priority source's", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:example",
        packages: [
          // flatpak-flathub outranks flatpak-appcenter in source priority,
          // but its date here is the *older* one — the max must win, not
          // pickField's usual priority pick.
          pkg({ source: "flatpak-flathub", lastUpdated: "2026-01-01T00:00:00.000Z" }),
          pkg({ source: "flatpak-appcenter", lastUpdated: "2026-08-10T00:00:00.000Z" }),
        ],
      },
    ];

    expect(enrichApps(matched)[0]?.lastUpdated).toBe("2026-08-10T00:00:00.000Z");
  });

  it("leaves lastUpdated undefined when no member package has one", () => {
    const matched: MatchedApp[] = [
      { id: "aur:example", packages: [pkg({ source: "pacman-aur", name: "example" })] },
    ];

    expect(enrichApps(matched)[0]?.lastUpdated).toBeUndefined();
  });

  it("sums installsTotal and installsLast7Days across member packages, unlike popularity's mean", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:example",
        packages: [
          pkg({
            source: "flatpak-flathub",
            installsTotal: 1_000_000,
            installsLast7Days: 5_000,
          }),
          pkg({ source: "flatpak-appcenter", installsTotal: 200_000, installsLast7Days: 800 }),
        ],
      },
    ];

    const app = enrichApps(matched)[0];
    expect(app?.installsTotal).toBe(1_200_000);
    expect(app?.installsLast7Days).toBe(5_800);
  });

  it("leaves installsTotal/installsLast7Days undefined when no member package reports either", () => {
    const matched: MatchedApp[] = [
      { id: "aur:example", packages: [pkg({ source: "pacman-aur", name: "example" })] },
    ];

    const app = enrichApps(matched)[0];
    expect(app?.installsTotal).toBeUndefined();
    expect(app?.installsLast7Days).toBeUndefined();
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
