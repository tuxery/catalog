import type { SourcedPackage } from "../types";
import type { LutrisCacheEntry } from "./types";

export function normalize(entries: LutrisCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "lutris",
    name: entry.name,
    description: entry.description,
    // No real version concept here — a Lutris installer's own "version"
    // field names the install variant/method (e.g. "CD + Windows 98"),
    // not a software release, so it isn't threaded through.
    version: "unknown",
    appId: entry.gameSlug,
    homepage: `https://lutris.net/games/${entry.gameSlug}/`,
    // Every entry here already passed fetch.ts's runner === "linux" filter.
    hasGameCategory: true,
  }));
}
