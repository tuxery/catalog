import type { SourcedPackage } from "../types";
import type { AurCacheEntry } from "./types";

// AUR's own submission guidelines reserve these suffixes for a
// rolling-release snapshot build of the exact same software as the
// unsuffixed package (e.g. `0xtools-git` tracks `0xtools`'s upstream repo
// directly) — not a different project. Also used by
// `@tuxery/curator`'s match tier to merge the two into one app; see
// `match/group.ts`'s `AUR_VCS_SUFFIX`.
const VCS_SUFFIX = /-(git|svn|hg|bzr|cvs)$/;

export function normalize(entries: AurCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => {
    const vcsMatch = VCS_SUFFIX.exec(entry.name);

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
      channel: vcsMatch ? vcsMatch[1] : undefined,
    };
  });
}
