import { searchAlpine } from "./alpine";
import { searchAppCenter } from "./appcenter";
import { searchAppImage } from "./appimage";
import { searchArch } from "./arch";
import { searchAur } from "./aur";
import { searchDebian } from "./debian";
import { searchDeepin } from "./deepin";
import { searchFedora } from "./fedora";
import { searchFlathub } from "./flathub";
import { searchGentoo } from "./gentoo";
import { searchMint } from "./mint";
import { searchNixpkgs } from "./nixpkgs";
import { searchOpenSuse } from "./opensuse";
import { searchPopOs } from "./popos";
import { searchSlackware } from "./slackware";
import { searchSnapcraft } from "./snapcraft";
import { searchSolus } from "./solus";
import type { SourcedPackage } from "./types";
import { searchUbuntu } from "./ubuntu";
import { searchVoid } from "./void";

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
  ]);

  return results.flat();
}
