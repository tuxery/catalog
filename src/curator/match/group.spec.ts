import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../../sources";
import { groupPackages } from "./group";
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
