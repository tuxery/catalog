import { nameAxes } from "../_shared/name-axes";
import type { SourcedPackage } from "../types";
import type { AurCacheEntry } from "./types";

export function normalize(entries: AurCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => {
    // Build tokens AUR's submission guidelines reserve for an alternate
    // build of the same software (`-git`, `-bin`, `-beta`, ...) — see
    // docs/product-families.md. match/group.ts folds these into the
    // unsuffixed project's app.
    const { risk, flavors } = nameAxes(entry.name);

    return {
      source: "pacman-aur",
      name: entry.name,
      description: entry.description,
      version: entry.version,
      // AUR package names are unique in the repo — the closest thing it has
      // to an app id.
      appId: entry.name,
      homepage: entry.homepage,
      keywords: entry.keywords,
      license: entry.license,
      popularity: entry.popularity,
      formal: entry.formal,
      risk,
      flavors,
      // `-bin`/`-appimage` repackage upstream's own binaries; anything else
      // is built from source on the user's machine from a community recipe,
      // which none of the provenance values describes yet.
      provenance: flavors ? "community-repack" : undefined,
    };
  });
}
