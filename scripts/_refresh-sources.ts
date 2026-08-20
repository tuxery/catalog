import { spawnSync } from "node:child_process";

// Kept as a literal list rather than importing @tuxery/sources: these
// root scripts sit outside the pnpm workspace glob (packages/*) and shell
// out to package CLIs instead of importing package code directly. Source
// of truth for the set of ids is packages/sources/src/types.ts's
// PackageSourceId union — keep this in sync with it.
const ALL_SOURCE_IDS = [
  "flatpak-flathub",
  "flatpak-appcenter",
  "snap-snapcraft",
  "appimage",
  "appimage-manual",
  "pacman-aur",
  "deb-debian",
  "deb-ubuntu",
  "rpm-fedora",
  "pacman-arch",
  "nix-nixpkgs",
  "rpm-opensuse",
  "rpm-rpmfusion",
  "apk-alpine",
  "xbps-void",
  "slackware",
  "eopkg-solus",
  "ebuild-gentoo",
  "deb-mint",
  "deb-popos",
  "deb-deepin",
  "deb-mxlinux",
  "gog",
  "lutris",
];

/** Re-fetches the given sources (default: all) via @tuxery/sources' existing `refresh` CLI, one at a time. */
export function refreshSources(sourceIds: string[] = ALL_SOURCE_IDS): void {
  for (const sourceId of sourceIds) {
    console.log(`Refreshing ${sourceId}...`);
    const result = spawnSync("pnpm", ["--filter", "@tuxery/sources", "refresh", sourceId], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
