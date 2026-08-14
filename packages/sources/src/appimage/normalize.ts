import type { SourcedPackage } from "../types";
import type { AppImageCacheEntry } from "./types";

export function normalize(entries: AppImageCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "appimage",
    name: entry.name,
    description: entry.description,
    version: entry.version ?? "unknown",
    appId: entry.repo,
    iconFilename: entry.iconFilename,
    homepage: entry.homepage,
  }));
}
