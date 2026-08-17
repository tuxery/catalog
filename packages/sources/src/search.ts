import { searchAlpine } from "./apk-alpine";
import { searchAppCenter } from "./flatpak-appcenter";
import { searchAppImage } from "./appimage";
import { searchArch } from "./pacman-arch";
import { searchAur } from "./pacman-aur";
import { searchDebian } from "./deb-debian";
import { searchDeepin } from "./deb-deepin";
import { searchFedora } from "./rpm-fedora";
import { searchFlathub } from "./flatpak-flathub";
import { searchGentoo } from "./ebuild-gentoo";
import { searchMint } from "./deb-mint";
import { searchMxLinux } from "./deb-mxlinux";
import { searchNixpkgs } from "./nix-nixpkgs";
import { searchOpenSuse } from "./rpm-opensuse";
import { searchPopOs } from "./deb-popos";
import { searchSlackware } from "./slackware";
import { searchSnapcraft } from "./snap-snapcraft";
import { searchSolus } from "./eopkg-solus";
import type { SourcedPackage } from "./types";
import { searchUbuntu } from "./deb-ubuntu";
import { searchVoid } from "./xbps-void";

/**
 * Queries every known source in parallel and returns the combined,
 * un-deduplicated results — pass this to `@tuxery/curator`'s
 * `filterPackages` then `groupPackages` to get a catalog of unified apps.
 */
export async function searchAllSources(query: string): Promise<SourcedPackage[]> {
  const results = await Promise.all([
    searchFlathub(query),
    searchAppCenter(query),
    searchSnapcraft(query),
    searchAppImage(query),
    searchAur(query),
    searchDebian(query),
    searchUbuntu(query),
    searchFedora(query),
    searchArch(query),
    searchNixpkgs(query),
    searchOpenSuse(query),
    searchAlpine(query),
    searchVoid(query),
    searchSlackware(query),
    searchSolus(query),
    searchGentoo(query),
    searchMint(query),
    searchPopOs(query),
    searchDeepin(query),
    searchMxLinux(query),
  ]);

  return results.flat();
}
