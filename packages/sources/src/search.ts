import { searchAlpine } from "./alpine";
import { searchAppImage } from "./appimage";
import { searchArch } from "./arch";
import { searchAur } from "./aur";
import { searchDebian } from "./debian";
import { searchFedora } from "./fedora";
import { searchFlathub } from "./flathub";
import { searchNixpkgs } from "./nixpkgs";
import { searchOpenSuse } from "./opensuse";
import { searchSnapcraft } from "./snapcraft";
import type { SourcedPackage } from "./types";
import { searchUbuntu } from "./ubuntu";

/**
 * Queries every known source in parallel and returns the combined,
 * un-deduplicated results — pass this to `@tuxery/curator`'s
 * `filterPackages` then `groupPackages` to get a catalog of unified apps.
 */
export async function searchAllSources(query: string): Promise<SourcedPackage[]> {
  const results = await Promise.all([
    searchFlathub(query),
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
  ]);

  return results.flat();
}
