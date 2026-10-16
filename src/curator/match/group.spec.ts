import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import { groupPackages, storeGenericNames } from "./group";
import type { MatchOverrides } from "./overrides";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return {
    source: "flatpak-flathub",
    name: "Example",
    description: "",
    version: "1.0.0",
    ...overrides,
  };
}

const NO_OVERRIDES: MatchOverrides = { force: [], denyPairs: new Set() };

describe("groupPackages", () => {
  it("groups packages with the same appId across sources (tier 1: exact appId)", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Discord", appId: "com.discordapp.Discord" }),
      pkg({ source: "snap-snapcraft", name: "Discord", appId: "com.discordapp.Discord" }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.packages).toHaveLength(2);
  });

  it("merges an AUR gog-* wrapper (variant suffix included) with the GOG.com listing of the same title", () => {
    const packages = [
      pkg({ source: "gog", name: "Stardew Valley" }),
      pkg({ source: "pacman-aur", name: "gog-stardew-valley" }),
      pkg({ source: "pacman-aur", name: "gog-hollow-knight-bin" }),
      pkg({ source: "gog", name: "Hollow Knight" }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.packages.length === 2)).toBe(true);
  });

  it("doesn't strip gog- from other sources or match a gog-* wrapper to a non-GOG package", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Stardew Valley" }),
      pkg({ source: "pacman-aur", name: "gog-stardew-valley" }),
      pkg({ source: "deb-debian", name: "gog-stardew-valley" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("keeps unrelated packages in separate groups", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Discord", appId: "com.discordapp.Discord" }),
      pkg({ source: "flatpak-flathub", name: "Spotify", appId: "com.spotify.Client" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("groups packages with the same normalized name but different/no appId (tier 2: exact name)", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "GIMP", appId: "org.gimp.GIMP" }),
      pkg({ source: "pacman-aur", name: "gimp", appId: undefined }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(1);
  });

  it("unions an AUR -git package with its unsuffixed twin, same or other source (tier 2: AUR VCS-suffix convention)", () => {
    const packages = [
      pkg({ source: "pacman-aur", name: "0xtools", appId: "0xtools" }),
      pkg({ source: "pacman-aur", name: "0xtools-git", appId: "0xtools-git" }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.packages).toHaveLength(2);
  });

  it("does not union a bare AUR package with an unrelated one that merely shares a different VCS suffix", () => {
    const packages = [
      pkg({ source: "pacman-aur", name: "foo-svn", appId: "foo-svn" }),
      pkg({ source: "pacman-aur", name: "foo-hg", appId: "foo-hg" }),
    ];

    // Both strip down to the same base "foo" — still a correct union,
    // just via two different VCS backends for the same upstream project.
    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(1);
  });

  it("unions an AUR -bin (prebuilt binary) package with its unsuffixed twin — the real zen-browser bug report", () => {
    const packages = [
      pkg({ source: "pacman-aur", name: "zen-browser", appId: "zen-browser" }),
      pkg({ source: "pacman-aur", name: "zen-browser-bin", appId: "zen-browser-bin" }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.packages).toHaveLength(2);
  });

  it("unions an AUR -appimage package and a nixpkgs -unwrapped package with their unsuffixed twins — the real GoldenDict-ng and Firefox PWA cases", () => {
    const packages = [
      pkg({ source: "deb-debian", name: "goldendict-ng" }),
      pkg({ source: "pacman-aur", name: "goldendict-ng-appimage" }),
      pkg({ source: "pacman-arch", name: "firefoxpwa" }),
      pkg({ source: "nix-nixpkgs", name: "firefoxpwa-unwrapped" }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.packages.length)).toEqual([2, 2]);
  });

  it("does not strip -appimage or -unwrapped from other sources", () => {
    const packages = [
      pkg({ source: "deb-debian", name: "foo" }),
      pkg({ source: "deb-ubuntu", name: "foo-appimage" }),
      pkg({ source: "rpm-fedora", name: "bar-unwrapped" }),
      pkg({ source: "rpm-opensuse", name: "bar" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(4);
  });

  it("unions an AUR variant with the project its name prefixes when the descriptions agree (tier 2c)", () => {
    const browser = "Fast, Private & Safe Web Browser";
    const packages = [
      pkg({ source: "deb-debian", name: "firefox", description: browser }),
      pkg({ source: "pacman-aur", name: "firefox-pure", description: browser }),
      pkg({
        source: "pacman-aur",
        name: "firefox-vaapi",
        description: `${browser} (with VA-API patches for Nvidia)`,
      }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.packages).toHaveLength(3);
  });

  it("keeps an AUR package that only shares a name prefix, or whose description is too short to compare", () => {
    const packages = [
      pkg({
        source: "deb-debian",
        name: "firefox",
        description: "Fast, Private & Safe Web Browser",
      }),
      pkg({
        source: "pacman-aur",
        name: "firefox-sync",
        description: "Speed up Firefox using tmpfs.",
      }),
      pkg({ source: "deb-debian", name: "tool", description: "A tool" }),
      pkg({ source: "pacman-aur", name: "tool-extra", description: "A tool" }),
      pkg({
        source: "pacman-aur",
        name: "firefox-esr",
        description: "Fast, Private & Safe Web Browser",
      }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);

    // firefox + firefox-esr merge (identical long description); the other two
    // AUR/short-description cases stay alone.
    const sizes = groups.map((g) => g.packages.length);
    expect(sizes.filter((size) => size === 2)).toHaveLength(1);
    expect(sizes.filter((size) => size === 1)).toHaveLength(3);
  });

  it("leaves gog-* sequels alone even when they reuse the prequel's description", () => {
    const description = "Rufus is not a pleasant guy. Ill-tempered and selfish.";
    const packages = [
      pkg({ source: "pacman-aur", name: "gog-deponia", description }),
      pkg({ source: "pacman-aur", name: "gog-deponia-2-chaos-on-deponia", description }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("does not apply the prefix rule to other sources", () => {
    const description = "Fast, Private & Safe Web Browser";
    const packages = [
      pkg({ source: "deb-debian", name: "firefox", description }),
      pkg({ source: "rpm-fedora", name: "firefox-pure", description }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("unions a Gentoo -bin ebuild with its build-from-source twin — the real firefox-bin bug report", () => {
    const packages = [
      pkg({ source: "ebuild-gentoo", name: "firefox", appId: undefined }),
      pkg({ source: "ebuild-gentoo", name: "firefox-bin", appId: undefined }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.packages).toHaveLength(2);
  });

  it("unions a Gentoo -bin package with a same-named package from an unrelated source too, not just within Gentoo", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Firefox", appId: "org.mozilla.firefox" }),
      pkg({ source: "ebuild-gentoo", name: "firefox-bin", appId: undefined }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(1);
  });

  it("unions AUR release-channel variants (beta/nightly, with or without a build-variant suffix) with the stable build — the real Brave Origin bug report", () => {
    const packages = [
      pkg({ source: "pacman-aur", name: "brave-origin-bin", appId: "brave-origin-bin" }),
      pkg({
        source: "pacman-aur",
        name: "brave-origin-beta-bin",
        appId: "brave-origin-beta-bin",
      }),
      pkg({
        source: "pacman-aur",
        name: "brave-origin-nightly-bin",
        appId: "brave-origin-nightly-bin",
      }),
      pkg({ source: "nix-nixpkgs", name: "brave-origin", appId: undefined }),
    ];

    // Before the fix: 4 separate apps — only "-bin" was stripped, leaving
    // "brave-origin-beta"/"brave-origin-nightly" as unrecognized bases
    // that never matched anything, including each other.
    const groups = groupPackages(packages, NO_OVERRIDES);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.packages).toHaveLength(4);
  });

  it("does not treat a -dev suffix as a release channel — collides with the unrelated Debian-style headers-package meaning", () => {
    const packages = [
      pkg({ source: "pacman-aur", name: "kodi-git", appId: "kodi-git" }),
      pkg({ source: "pacman-aur", name: "kodi-git-dev", appId: "kodi-git-dev" }),
    ];

    // "kodi-git-dev" is real headers/dev-files for the kodi-git build, not
    // a "dev channel" of it — must NOT collapse into kodi-git's group.
    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("does not strip a VCS-shaped suffix from non-AUR sources", () => {
    const packages = [
      pkg({ source: "deb-debian", name: "widget-git", appId: undefined }),
      pkg({ source: "deb-debian", name: "widget", appId: undefined }),
    ];

    // Debian doesn't use AUR's VCS-suffix convention — "widget-git" and
    // "widget" could be genuinely unrelated packages, so no stripping.
    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("unions on appId even when names are completely different — appId is a stronger signal than name similarity", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "vscode", appId: "com.visualstudio.code" }),
      pkg({ source: "snap-snapcraft", name: "visual-studio-code", appId: "com.visualstudio.code" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(1);
  });

  it("does not merge packages with neither a shared appId nor a shared normalized name", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "vscode", appId: "com.visualstudio.code" }),
      pkg({ source: "snap-snapcraft", name: "visual-studio-code", appId: "different-app-id" }),
    ];

    // No fuzzy/scored fallback — see group.ts's doc comment for why a
    // scored tier could never fire here anyway given the current weights.
    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("tier 0: manual overrides force a union regardless of appId/name", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Totally Different Name", appId: "org.example.a" }),
      pkg({
        source: "pacman-aur",
        name: "unrelated-looking-name",
        appId: "unrelated-looking-name",
      }),
    ];
    const overrides: MatchOverrides = {
      force: [
        {
          destination: { source: "flatpak-flathub", appId: "org.example.a" },
          sources: [{ source: "pacman-aur", appId: "unrelated-looking-name" }],
          reason: "test: manually confirmed same app under very different names",
        },
      ],
      denyPairs: new Set(),
    };

    expect(groupPackages(packages, overrides)).toHaveLength(1);
  });

  it("tier 0: a force entry with multiple sources unions all of them into destination", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Main", appId: "org.example.main" }),
      pkg({ source: "pacman-arch", name: "variant-a", appId: "variant-a" }),
      pkg({ source: "pacman-arch", name: "variant-b", appId: "variant-b" }),
    ];
    const overrides: MatchOverrides = {
      force: [
        {
          destination: { source: "flatpak-flathub", appId: "org.example.main" },
          sources: [
            { source: "pacman-arch", appId: "variant-a" },
            { source: "pacman-arch", appId: "variant-b" },
          ],
          reason: "test: one destination, multiple sources merging into it",
        },
      ],
      denyPairs: new Set(),
    };

    expect(groupPackages(packages, overrides)).toHaveLength(1);
  });

  it("deny overrides block an otherwise-exact appId match", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Ambiguous", appId: "shared-id" }),
      pkg({ source: "pacman-aur", name: "Ambiguous", appId: "shared-id" }),
    ];
    const overrides: MatchOverrides = {
      force: [],
      denyPairs: new Set(["flatpak-flathub:shared-id|pacman-aur:shared-id"]),
    };

    expect(groupPackages(packages, overrides)).toHaveLength(2);
  });

  it("does not union generic-name-blocklisted names on name alone (tier 2 is skipped for them)", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Calculator", appId: "org.gnome.Calculator" }),
      pkg({ source: "flatpak-flathub", name: "Calculator", appId: "org.kde.kalk" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("does not union singularity/ace/bass — real bug found live via category-section.ts miscategorizing the unrelated projects merged under these generic names", () => {
    const singularity = [
      pkg({ source: "pacman-aur", name: "singularity-ce", appId: "singularity-ce" }),
      pkg({ source: "deb-debian", name: "singularity", appId: "singularity", section: "games" }),
    ];
    expect(groupPackages(singularity, NO_OVERRIDES)).toHaveLength(2);

    const ace = [
      pkg({ source: "ebuild-gentoo", name: "Ace", appId: "dev-perl/Ace", section: "dev-perl" }),
      pkg({
        source: "ebuild-gentoo",
        name: "ace",
        appId: "games-board/ace",
        section: "games-board",
      }),
    ];
    expect(groupPackages(ace, NO_OVERRIDES)).toHaveLength(2);

    const bass = [
      pkg({ source: "pacman-arch", name: "bass", appId: "bass" }),
      pkg({ source: "ebuild-gentoo", name: "bass", appId: "games-rpg/bass", section: "games-rpg" }),
    ];
    expect(groupPackages(bass, NO_OVERRIDES)).toHaveLength(2);
  });

  it("still unions a blocklisted name via tier 1 (exact appId) when appId genuinely matches", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Calculator", appId: "org.gnome.Calculator" }),
      pkg({ source: "snap-snapcraft", name: "gnome-calculator", appId: "org.gnome.Calculator" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(1);
  });

  it("does not union on appId alone when the appId itself is a blocklisted generic word (tier 1 gap fix)", () => {
    // Bare-package-name sources (AUR, Fedora, ...) set appId to the
    // literal package name — two unrelated tools both literally named
    // "weather" would previously union on that shared appId with zero
    // defense, the exact gap tier 2's blocklist already closed for names.
    const packages = [
      pkg({ source: "pacman-aur", name: "weather", appId: "weather" }),
      pkg({ source: "rpm-fedora", name: "weather", appId: "weather" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("blocklists a bare appId case-insensitively, same normalization tier 2 already uses for names", () => {
    const packages = [
      pkg({ source: "pacman-aur", name: "Clock", appId: "Clock" }),
      pkg({ source: "rpm-fedora", name: "clock", appId: "clock" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(2);
  });

  it("still unions non-blocklisted bare appIds via tier 1 as normal", () => {
    const packages = [
      pkg({ source: "pacman-aur", name: "firefox", appId: "firefox" }),
      pkg({ source: "rpm-fedora", name: "firefox", appId: "firefox" }),
    ];

    expect(groupPackages(packages, NO_OVERRIDES)).toHaveLength(1);
  });

  it("uses the real override files when none are passed", () => {
    const packages = [pkg({ source: "flatpak-flathub", name: "Solo", appId: "org.example.solo" })];

    expect(groupPackages(packages)).toHaveLength(1);
  });

  it("real-world regression: Zen Browser merges across sources, without pulling in the unrelated AUR 'zen' tool", () => {
    // The exact user-reported bug: flatpak-flathub:app.zen_browser.zen,
    // snap-snapcraft:zen-browser-snap, and pacman-aur:zen-browser-bin were
    // three separate apps. Root causes, found live: (1) AUR's -bin
    // prebuilt-binary convention wasn't stripped like -git already was,
    // so zen-browser-bin never joined zen-browser/zen-browser-snap: fixed
    // by VARIANT_SUFFIX. (2) Flathub's short "Zen" name was instead
    // merging with an unrelated AUR "zen" (a C-language stress-relief
    // tool, nothing to do with the browser) via the generic-word
    // collision GENERIC_NAME_BLOCKLIST exists for: fixed by blocklisting
    // "zen" and bridging Flathub's real appId to AUR's zen-browser
    // family via config/match-force.json instead.
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Zen", appId: "app.zen_browser.zen" }),
      pkg({ source: "snap-snapcraft", name: "Zen Browser", appId: "zen-browser-snap" }),
      pkg({ source: "pacman-aur", name: "zen-browser", appId: "zen-browser" }),
      pkg({ source: "pacman-aur", name: "zen-browser-bin", appId: "zen-browser-bin" }),
      pkg({
        source: "pacman-aur",
        name: "zen",
        appId: "zen",
        description: "Reduce your stress with the C language",
      }),
    ];

    const groups = groupPackages(packages);
    const browserGroup = groups.find((g) =>
      g.packages.some((p) => p.appId === "app.zen_browser.zen"),
    );

    expect(browserGroup?.packages).toHaveLength(4);
    expect(browserGroup?.packages.some((p) => p.appId === "zen")).toBe(false);
    expect(groups.some((g) => g.packages.length === 1 && g.packages[0]?.appId === "zen")).toBe(
      true,
    );
  });

  it("real-world regression: GNOME Boxes merges Flathub with Snap/native, without pulling in the unrelated 'boxes' ASCII-art tool", () => {
    // Found live investigating the compat-warnings feature: Flathub's
    // "Boxes" (org.gnome.Boxes.desktop) was merging with AUR/Fedora/
    // Nixpkgs/Gentoo/Debian/Ubuntu's own "boxes" packages under the
    // generic-word collision GENERIC_NAME_BLOCKLIST exists for — every
    // one of those is actually boxes.thomasjensen.com, a real, unrelated
    // ASCII-art text tool, nothing to do with virtualization. Meanwhile
    // GNOME Boxes' own Snap/native packages (all named "gnome-boxes", a
    // different normalized name) were never part of that cluster and
    // stayed a separate app. Fixed by blocklisting "boxes" and bridging
    // Flathub's real appId to Snap's gnome-boxes via
    // config/match-force.json instead.
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Boxes", appId: "org.gnome.Boxes.desktop" }),
      pkg({ source: "snap-snapcraft", name: "GNOME Boxes", appId: "gnome-boxes" }),
      pkg({ source: "deb-debian", name: "gnome-boxes", appId: "gnome-boxes" }),
      pkg({
        source: "pacman-aur",
        name: "boxes",
        appId: "boxes",
        description: "Text mode box and comment drawing filter",
      }),
    ];

    const groups = groupPackages(packages);
    const boxesGroup = groups.find((g) =>
      g.packages.some((p) => p.appId === "org.gnome.Boxes.desktop"),
    );

    expect(boxesGroup?.packages).toHaveLength(3);
    expect(boxesGroup?.packages.some((p) => p.appId === "boxes")).toBe(false);
    expect(groups.some((g) => g.packages.length === 1 && g.packages[0]?.appId === "boxes")).toBe(
      true,
    );
  });
});

describe("buildAppId (via groupPackages' id field)", () => {
  it("prefers Snap's own unique name over Flatpak's reverse-DNS id when a group has both", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Firefox", appId: "org.mozilla.firefox" }),
      pkg({ source: "snap-snapcraft", name: "Firefox", appId: "firefox" }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("firefox");
  });

  it("falls back to Flatpak's reverse-DNS id when there's no Snap package", () => {
    const packages = [pkg({ source: "flatpak-flathub", name: "GIMP", appId: "org.gimp.GIMP" })];

    const groups = groupPackages(packages, NO_OVERRIDES);
    expect(groups[0]?.id).toBe("org.gimp.GIMP");
  });

  it("prefers flatpak-flathub's appId over flatpak-appcenter's when a group has both with different appIds", () => {
    const packages = [
      pkg({ source: "flatpak-flathub", name: "Tasks", appId: "dev.example.tasks" }),
      pkg({ source: "flatpak-appcenter", name: "Tasks", appId: "io.elementary.tasks" }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);
    expect(groups[0]?.id).toBe("dev.example.tasks");
  });

  it("falls back to source:appId when there's neither Snap nor Flatpak", () => {
    const packages = [pkg({ source: "pacman-aur", name: "0cc-famitracker", appId: undefined })];

    const groups = groupPackages(packages, NO_OVERRIDES);
    expect(groups[0]?.id).toBe("pacman-aur:0cc-famitracker");
  });

  it("normalizes a slash in the fallback tier's appId to a colon, not mixed with the source separator", () => {
    // GitHub Releases/AppImage's owner/repo shape and Gentoo's
    // category/name shape both carry a real "/" — verified live that
    // ":" never occurs naturally in any real appId/name anywhere in the
    // catalog, so it's safe to reuse as the id's only separator instead
    // of mixing "/" and ":" in the same string.
    const packages = [
      pkg({ source: "github-releases", name: "Community", appId: "AkashaProject/Community" }),
    ];

    const groups = groupPackages(packages, NO_OVERRIDES);
    expect(groups[0]?.id).toBe("github-releases:AkashaProject:Community");
  });
});

describe("groupPackages — product families", () => {
  const aur = (name: string, description: string, formal?: SourcedPackage["formal"]) =>
    pkg({ source: "pacman-aur", name, appId: name, description, formal });

  it("folds a drop-in build into its project and labels its flavor and provenance", () => {
    const groups = groupPackages(
      [
        aur("firefox", "Fast, Private & Safe Web Browser"),
        aur("firefox-globalmenu", "Firefox with the global menu patch", {
          provides: ["firefox"],
          conflicts: ["firefox"],
        }),
      ],
      NO_OVERRIDES,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.packages[1]).toMatchObject({
      flavors: ["globalmenu"],
      provenance: "community-patched",
    });
  });

  it("keeps forks and unrelated colliding packages apart, even when they declare provides+conflicts", () => {
    const groups = groupPackages(
      [
        aur("goldendict", "Feature-rich dictionary lookup program"),
        aur("goldendict-ng", "Feature-rich dictionary lookup program", {
          provides: ["goldendict"],
          conflicts: ["goldendict"],
        }),
        aur("ack", "A Perl-based grep replacement"),
        aur("ack-cpm", "A C compiler for 8-bit CPUs", { provides: ["ack"], conflicts: ["ack"] }),
      ],
      NO_OVERRIDES,
    );

    expect(groups).toHaveLength(4);
  });

  it("merges and labels a curated track, keeping the product's own id", () => {
    const groups = groupPackages(
      [
        pkg({ source: "pacman-aur", name: "firefox-esr-bin", appId: "firefox-esr-bin" }),
        pkg({ source: "deb-debian", name: "firefox-esr", appId: "firefox-esr" }),
        pkg({ source: "pacman-arch", name: "firefox", appId: "firefox" }),
      ],
      {
        ...NO_OVERRIDES,
        tracks: [{ product: "firefox", track: "esr", names: ["firefox-esr"], reason: "test" }],
      },
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("pacman-arch:firefox");
    expect(groups[0]?.packages.map((member) => member.track)).toEqual(["esr", "esr", undefined]);
  });

  it("names a group after its default build, not a patched one", () => {
    const groups = groupPackages(
      [
        aur("thunar-extended", "File Browser", { provides: ["thunar"], conflicts: ["thunar"] }),
        aur("thunar-git", "File Browser"),
        pkg({
          source: "pacman-arch",
          name: "thunar",
          appId: "thunar",
          description: "File Browser",
        }),
      ],
      NO_OVERRIDES,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("pacman-aur:thunar-git");
  });

  it("names a Flatpak group after the id its other ids extend", () => {
    const groups = groupPackages(
      [
        pkg({ name: "VSCodium Insiders", appId: "com.vscodium.codium-insiders" }),
        pkg({ name: "VSCodium", appId: "com.vscodium.codium" }),
      ],
      {
        ...NO_OVERRIDES,
        force: [
          {
            destination: { source: "flatpak-flathub", appId: "com.vscodium.codium" },
            sources: [{ source: "flatpak-flathub", appId: "com.vscodium.codium-insiders" }],
            reason: "test",
          },
        ],
      },
    );

    expect(groups[0]?.id).toBe("com.vscodium.codium");
  });

  it("folds AUR builds that only differ by language, and Void's -32bit builds", () => {
    const groups = groupPackages(
      [
        pkg({ name: "Betterbird", appId: "eu.betterbird.Betterbird" }),
        aur("betterbird-de-bin", "Fine-tuned version of Mozilla Thunderbird, German"),
        aur("betterbird-ja-bin", "Fine-tuned version of Mozilla Thunderbird, Japanese"),
        pkg({ source: "xbps-void", name: "3proxy", appId: "3proxy" }),
        pkg({
          source: "xbps-void",
          name: "3proxy-32bit",
          appId: "3proxy-32bit",
          flavors: ["32bit"],
        }),
      ],
      NO_OVERRIDES,
    );

    expect(groups.map((group) => group.packages.length).toSorted()).toEqual([2, 3]);
    expect(groups.find((group) => group.packages.length === 3)?.packages[1]?.flavors).toEqual([
      "locale:de",
    ]);
    expect(groups.find((group) => group.packages.length === 2)?.id).toBe("xbps-void:3proxy");
  });

  it("merges a distribution's AppStream entry with the Flathub app of the same id, never through a package describing several apps", () => {
    const groups = groupPackages(
      [
        pkg({ name: "Calendar", appId: "org.gnome.Calendar", appstreamId: "org.gnome.Calendar" }),
        pkg({
          source: "pacman-arch-appstream",
          name: "Calendar",
          appId: "gnome-calendar",
          appstreamId: "org.gnome.Calendar",
        }),
        pkg({
          name: "Doom",
          appId: "io.github.fabiangreffrath.Doom",
          appstreamId: "io.github.fabiangreffrath.Doom",
        }),
        pkg({
          name: "Heretic",
          appId: "io.github.fabiangreffrath.Heretic",
          appstreamId: "io.github.fabiangreffrath.Heretic",
        }),
        pkg({
          source: "rpm-opensuse-appstream",
          name: "Crispy Doom",
          appId: "crispy-doom",
          appstreamId: "io.github.fabiangreffrath.Doom",
        }),
        pkg({
          source: "rpm-opensuse-appstream",
          name: "Crispy Heretic",
          appId: "crispy-doom",
          appstreamId: "io.github.fabiangreffrath.Heretic",
        }),
      ],
      NO_OVERRIDES,
    );

    const calendar = groups.find((group) => group.id === "org.gnome.Calendar");
    expect(calendar?.packages).toHaveLength(2);
    expect(
      groups.find((group) => group.id === "io.github.fabiangreffrath.Doom")?.packages,
    ).toHaveLength(1);
  });

  it("keeps a package describing several apps out of name matching, so one generic name doesn't chain unrelated products (real case: sgt-puzzles' Mines, 'dotnet' group of 202)", () => {
    const groups = groupPackages(
      [
        pkg({ source: "deb-debian", name: "gnome-mines", appId: "gnome-mines" }),
        pkg({
          source: "deb-debian-appstream",
          name: "Mines",
          appId: "gnome-mines",
          appstreamId: "org.gnome.Mines",
        }),
        pkg({ source: "deb-debian", name: "sgt-puzzles", appId: "sgt-puzzles" }),
        pkg({
          source: "deb-debian-appstream",
          name: "Mines",
          appId: "sgt-puzzles",
          appstreamId: "uk.org.greenend.chiark.sgtatham.mines",
        }),
        pkg({
          source: "deb-debian-appstream",
          name: "Map",
          appId: "sgt-puzzles",
          appstreamId: "uk.org.greenend.chiark.sgtatham.map",
        }),
      ],
      NO_OVERRIDES,
    );

    const mines = groups.find((group) => group.packages.some((p) => p.name === "gnome-mines"));
    expect(mines?.packages.map((p) => p.appId)).toEqual(["gnome-mines", "gnome-mines"]);
  });

  it("does not merge two terminals through their shared generic AppStream name (real case: Ptyxis and GNOME Terminal)", () => {
    const groups = groupPackages(
      [
        pkg({ source: "deb-ubuntu-appstream", name: "Terminal", appId: "ptyxis" }),
        pkg({ source: "deb-ubuntu-appstream", name: "Terminal", appId: "gnome-terminal" }),
      ],
      NO_OVERRIDES,
    );

    expect(groups).toHaveLength(2);
  });

  it("never merges an app and a game that only share a name (real cases: Fractal, Digger)", () => {
    const groups = groupPackages(
      [
        pkg({ name: "Fractal", appId: "org.gnome.Fractal", categories: ["Network", "Chat"] }),
        pkg({ source: "pacman-aur", name: "fractal", appId: "fractal" }),
        pkg({ source: "lutris", name: "Fractal", appId: "fractal-humble", categories: ["Puzzle"] }),
        pkg({ name: "Digger", appId: "io.github.tobagin.digger", categories: ["Network"] }),
        pkg({ source: "rpm-fedora", name: "digger", appId: "digger" }),
        pkg({
          source: "ebuild-gentoo",
          name: "digger",
          appId: "games-arcade/digger",
          section: "games-arcade",
        }),
        pkg({ source: "pacman-aur", name: "digger", appId: "digger" }),
      ],
      NO_OVERRIDES,
    );

    const groupOf = (appId: string) =>
      groups.find((group) => group.packages.some((p) => p.appId === appId));
    expect(groupOf("fractal-humble")).not.toBe(groupOf("org.gnome.Fractal"));
    expect(groupOf("fractal")).toBe(groupOf("org.gnome.Fractal"));
    expect(groupOf("games-arcade/digger")).not.toBe(groupOf("io.github.tobagin.digger"));
  });

  it("still merges a game tool or an educational game across its sources (real cases: AntiMicroX, Speed Dreams)", () => {
    const groups = groupPackages(
      [
        pkg({
          name: "AntiMicroX",
          appId: "io.github.antimicrox.antimicrox",
          categories: ["Utility"],
        }),
        pkg({
          source: "rpm-fedora-appstream",
          name: "AntiMicroX",
          appId: "antimicrox",
          categories: ["Game", "Qt", "Utility"],
        }),
        pkg({
          name: "Speed Dreams",
          appId: "org.speed_dreams.SpeedDreams",
          categories: ["Simulation"],
        }),
        pkg({
          source: "ebuild-gentoo",
          name: "speed-dreams",
          appId: "games-sports/speed-dreams",
          section: "games-sports",
        }),
      ],
      NO_OVERRIDES,
    );

    expect(groups).toHaveLength(2);
  });

  it("keeps curated homonyms apart through any chain of packages (real case: Dolphin)", () => {
    const groups = groupPackages(
      [
        pkg({ source: "pacman-arch", name: "dolphin", appId: "dolphin" }),
        pkg({
          source: "ebuild-gentoo",
          name: "dolphin",
          appId: "games-emulation/dolphin",
          section: "games-emulation",
        }),
        pkg({ source: "deb-debian", name: "dolphin", appId: "dolphin" }),
        pkg({ name: "Dolphin", appId: "org.kde.dolphin.desktop" }),
      ],
      {
        ...NO_OVERRIDES,
        apart: [
          {
            a: [{ source: "ebuild-gentoo", appId: "games-emulation/dolphin" }],
            b: [
              { source: "pacman-arch", appId: "dolphin" },
              { source: "deb-debian", appId: "dolphin" },
              { source: "flatpak-flathub", appId: "org.kde.dolphin.desktop" },
            ],
            reason: "test",
          },
        ],
      },
    );

    const emulator = groups.find((group) =>
      group.packages.some((p) => p.appId === "games-emulation/dolphin"),
    );
    expect(emulator?.packages).toHaveLength(1);
    expect(groups.find((group) => group !== emulator)?.packages).toHaveLength(3);
  });

  it("lets a group a force-merge built across the app/game divide take in more of its packages (real case: INSTEAD)", () => {
    const groups = groupPackages(
      [
        pkg({
          source: "snap-snapcraft",
          name: "instead-linux",
          appId: "instead-linux",
          categories: ["Development"],
        }),
        pkg({
          source: "deb-debian-appstream",
          name: "INSTEAD",
          appId: "instead",
          categories: ["Game", "AdventureGame"],
        }),
        pkg({ source: "deb-debian", name: "instead", appId: "instead" }),
        pkg({ source: "xbps-void", name: "instead", appId: "instead" }),
      ],
      {
        ...NO_OVERRIDES,
        force: [
          {
            destination: { source: "deb-debian", appId: "instead" },
            sources: [
              { source: "snap-snapcraft", appId: "instead-linux" },
              { source: "deb-debian-appstream", appId: "instead" },
            ],
            reason: "test",
          },
        ],
      },
    );

    expect(groups).toHaveLength(1);
  });

  it("merges packages sharing a project homepage under the same name, not different products of one project", () => {
    const groups = groupPackages(
      [
        pkg({
          name: "John the Ripper",
          appId: "com.openwall.John",
          homepage: "https://www.openwall.com/john/",
        }),
        pkg({
          source: "pacman-aur",
          name: "john-git",
          appId: "john-git",
          description: "John the Ripper password cracker",
          homepage: "https://openwall.com/john",
        }),
        pkg({ source: "pacman-aur", name: "atuin", appId: "atuin", homepage: "https://atuin.sh" }),
        pkg({
          source: "pacman-aur",
          name: "atuin-desktop-bin",
          appId: "atuin-desktop-bin",
          homepage: "https://atuin.sh",
        }),
      ],
      NO_OVERRIDES,
    );

    expect(groups.map((group) => group.packages.length).toSorted()).toEqual([1, 1, 2]);
  });
});

/** The group holding the package with `appId`. */
const groupOf = (groups: ReturnType<typeof groupPackages>, appId: string) =>
  groups.find((group) => group.packages.some((member) => member.appId === appId));

describe("store-generic names", () => {
  it("finds the names a titled store gives two different apps, not a build's", () => {
    const generic = storeGenericNames([
      pkg({ name: "Media Downloader", appId: "com.markopejic.downloader" }),
      pkg({ name: "Media Downloader", appId: "io.github.mhogomchungu.media-downloader" }),
      pkg({ name: "Firefox", appId: "org.mozilla.firefox" }),
      pkg({ name: "Firefox", appId: "org.mozilla.firefox", track: "esr" }),
      pkg({ source: "snap-snapcraft", name: "Firefox", appId: "firefox" }),
      // Distro package names follow their own conventions: never counted.
      pkg({ source: "pacman-aur", name: "rsync", appId: "rsync" }),
      pkg({ source: "pacman-aur", name: "Rsync", appId: "rsync-git" }),
    ]);
    expect([...generic]).toEqual(["mediadownloader"]);
  });

  it("doesn't chain different apps through a title a store gives several of them", () => {
    // 2026-10-16: Flathub's three "Media Downloader" and the Snap Store's
    // "Text Editor" (twig) chained gedit, GNOME Text Editor, twig and more.
    const groups = groupPackages(
      [
        pkg({ name: "Media Downloader", appId: "com.markopejic.downloader" }),
        pkg({ name: "Media Downloader", appId: "com.warlordsoftwares.media-downloader" }),
        pkg({ name: "Media Downloader", appId: "io.github.mhogomchungu.media-downloader" }),
        pkg({ source: "appimage", name: "Media Downloader", appId: "hmidani/Media_Downloader" }),
      ],
      NO_OVERRIDES,
    );
    expect(groups).toHaveLength(4);
  });

  it("still joins a store package on such a title when both point at the same homepage", () => {
    const groups = groupPackages(
      [
        pkg({ name: "Wine", appId: "org.winehq.Wine", homepage: "https://www.winehq.org/" }),
        pkg({ source: "snap-snapcraft", name: "Wine", appId: "wine-platform-runtime" }),
        pkg({
          source: "snap-snapcraft",
          name: "Wine",
          appId: "wine-community",
          homepage: "https://example.org/wine",
        }),
        pkg({
          source: "deb-debian",
          name: "wine",
          appId: "wine",
          homepage: "https://www.winehq.org",
        }),
        pkg({
          source: "rpm-fedora",
          name: "wine",
          appId: "wine",
          homepage: "https://www.winehq.org/",
        }),
        // winehq.org carries many packages (wine-mono, wine-gecko, wine-staging,
        // ...), past what the same-homepage tier (2f) looks at.
        ...Array.from({ length: 40 }, (_, index) =>
          pkg({
            source: "pacman-aur",
            name: `wine-extra-${index}`,
            appId: `wine-extra-${index}`,
            homepage: "https://www.winehq.org",
          }),
        ),
      ],
      NO_OVERRIDES,
    );
    const wine = groupOf(groups, "org.winehq.Wine");
    expect(wine?.packages.map((member) => `${member.source}:${member.appId}`).toSorted()).toEqual([
      "deb-debian:wine",
      "flatpak-flathub:org.winehq.Wine",
      "rpm-fedora:wine",
    ]);
    expect(groupOf(groups, "wine-community")?.packages).toHaveLength(1);
  });

  it("keeps matching distro packages among themselves on a store-generic name", () => {
    const groups = groupPackages(
      [
        pkg({ source: "snap-snapcraft", name: "rsync", appId: "rsync-leftyfb" }),
        pkg({ source: "snap-snapcraft", name: "rsync", appId: "rsync" }),
        pkg({ source: "deb-debian", name: "rsync", appId: "rsync" }),
        pkg({ source: "pacman-arch", name: "rsync", appId: "rsync" }),
      ],
      NO_OVERRIDES,
    );
    expect(groupOf(groups, "rsync-leftyfb")?.packages).toHaveLength(1);
    // Debian and Arch still meet (and the snap named rsync, through its id).
    expect(
      groups.some(
        (group) =>
          group.packages.filter((member) => member.source !== "snap-snapcraft").length === 2,
      ),
    ).toBe(true);
  });

  it("applies the curated blocklist's multi-word entries to normalized names", () => {
    // `normalizeName` drops spaces: "text editor" as written never matched
    // "texteditor" before 2026-10-16.
    const groups = groupPackages(
      [
        pkg({ source: "pacman-arch-appstream", name: "Text Editor", appId: "deepin-editor" }),
        pkg({ source: "deb-debian-appstream", name: "Text Editor", appId: "gnome-text-editor" }),
      ],
      NO_OVERRIDES,
    );
    expect(groups).toHaveLength(2);
  });
});
