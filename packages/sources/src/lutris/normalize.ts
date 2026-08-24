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
    // NOT hasGameCategory: true — real bug, found live: Lutris hosts
    // install scripts for plenty of non-game Windows software people run
    // via Wine (Discord, Battle.net's own client, ...), not just games,
    // and neither of its two APIs (/api/installers, the one this
    // connector fetches — no genre field at all; /api/games, checked
    // live too — an id/name/platforms/IGDB-artwork shape, also no
    // genre/category field) carries any signal to tell them apart. A
    // Lutris-only real game simply won't get the "Game" badge until a
    // better signal exists — an honest gap, not a source of false badges
    // like "Discord" tagged as a game was.
  }));
}
