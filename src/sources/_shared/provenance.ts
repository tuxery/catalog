import type { PackageSourceId, Provenance, SourcedPackage } from "../types";

/**
 * Each source's provenance when its connector doesn't set a more specific
 * one (docs/product-families.md). Distributions rebuild from source, except
 * the four connectors scoped to their distro's own first-party apps
 * (Mint's mintinstall/Warpinator, System76's COSMIC, Deepin's DDE, MX's
 * tools), where the distro is the upstream. Sources missing here
 * (Flathub, Snapcraft, AppImage, GOG, Lutris, AUR, ...) stay unknown
 * unless their connector has a real signal — see each `normalize.ts`.
 */
const DEFAULT_PROVENANCE: Partial<Record<PackageSourceId, Provenance>> = {
  "deb-debian": "distro",
  "deb-debian-appstream": "distro",
  "deb-ubuntu": "distro",
  "deb-ubuntu-appstream": "distro",
  "rpm-fedora": "distro",
  "rpm-fedora-appstream": "distro",
  "rpm-opensuse": "distro",
  "rpm-opensuse-appstream": "distro",
  "rpm-rpmfusion": "distro",
  "pacman-arch": "distro",
  "pacman-arch-appstream": "distro",
  "nix-nixpkgs": "distro",
  "apk-alpine": "distro",
  "xbps-void": "distro",
  slackware: "distro",
  "eopkg-solus": "distro",
  "ebuild-gentoo": "distro",
  "deb-mint": "upstream",
  "deb-popos": "upstream",
  "deb-deepin": "upstream",
  "deb-mxlinux": "upstream",
};

/** `pkg` with its source's default provenance, unless it already has one. Pure. */
export function withDefaultProvenance(pkg: SourcedPackage): SourcedPackage {
  const provenance = pkg.provenance ?? DEFAULT_PROVENANCE[pkg.source];
  return provenance === pkg.provenance ? pkg : { ...pkg, provenance };
}
