import type { SourcedPackage } from "../types";
import type { AurCacheEntry } from "./types";

export function normalize(entries: AurCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "pacman-aur",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // AUR package names are unique in the repo — the closest thing it has
    // to an app id.
    appId: entry.name,
    homepage: entry.homepage,
  }));
}
