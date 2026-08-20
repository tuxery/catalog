import type { SourcedPackage } from "../types";
import type { ManualAppImageCacheEntry } from "./types";

export function normalize(entries: ManualAppImageCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "appimage-manual",
    name: entry.name,
    description: entry.description,
    // No release feed to read a real version from — same "unknown"
    // precedent as GOG/Lutris.
    version: "unknown",
    appId: entry.name,
    homepage: entry.homepage,
  }));
}
