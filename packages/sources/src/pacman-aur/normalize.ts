import type { SourcedPackage } from "../types";
import type { AurCacheEntry } from "./types";

// AUR's own submission guidelines reserve these suffixes for an alternate
// build of the exact same software as the unsuffixed package — not a
// different project. Two conventions: `-git`/`-svn`/`-hg`/`-bzr`/`-cvs`
// mark a rolling-release snapshot build (e.g. `0xtools-git` tracks
// `0xtools`'s upstream repo directly); `-bin` marks a prebuilt-binary
// build instead of building from source (e.g. `zen-browser-bin`). Also
// used by `@tuxery/curator`'s match tier to merge each variant into its
// base package's app; see `match/group.ts`'s `AUR_VARIANT_SUFFIX`.
const VARIANT_SUFFIX = /-(git|svn|hg|bzr|cvs|bin)$/;

export function normalize(entries: AurCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => {
    const variantMatch = VARIANT_SUFFIX.exec(entry.name);

    return {
      source: "pacman-aur",
      name: entry.name,
      description: entry.description,
      version: entry.version,
      // AUR package names are unique in the repo — the closest thing it has
      // to an app id.
      appId: entry.name,
      homepage: entry.homepage,
      popularity: entry.popularity,
      channel: variantMatch ? variantMatch[1] : undefined,
    };
  });
}
