import { spawnSync } from "node:child_process";

// Kept as a literal list rather than importing it: `PackageSourceId` (src/
// sources/types.ts) is a type, not a runtime value — nothing to import.
// Keep this in sync with that union by hand.
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
  "github-releases",
];

/** Re-fetches the given sources (default: all) via the `refresh` script, one at a time. */
export function refreshSources(sourceIds: string[] = ALL_SOURCE_IDS): void {
  for (const sourceId of sourceIds) {
    console.log(`Refreshing ${sourceId}...`);
    const result = spawnSync("pnpm", ["run", "refresh", sourceId], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
