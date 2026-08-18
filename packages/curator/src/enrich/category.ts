// freedesktop.org's menu spec (spec.freedesktop.org/menu-spec) registers 13
// "Main Categories" every app is expected to carry at least one of, plus a
// long tail of "Additional Categories" (subgenres like ArcadeGame,
// TextEditor, WebBrowser, ...). This taxonomy uses the Main Categories only
// — verified against real Flathub data (3,240 desktop-application
// components, 2026-08-17): 2,561 (79%) carry a non-Game Main Category,
// 652 (20%) are Game-only (handled separately by `CatalogApp.contentType`,
// not this), and only 27 (0.8%) have neither — a narrower, more
// conservative first slice than trying to also map the much larger, far
// less consistently-used Additional Categories set. Cross-checked against
// Microsoft Store's own published taxonomy (25 app categories) and the
// original homepage spec's section names (productivité, musique,
// créativité, ...) for the display labels below — full adoption of
// either would be overkill for Tuxery's current catalog size, per the
// "Define the category taxonomy" card's own research.
//
// "Game" is deliberately excluded: `CatalogApp.contentType` already
// covers it, and genre-level game categorization (ArcadeGame, Shooter,
// Strategy, ...) is out of scope here — see the "Apps page and Games
// page" card, which explicitly defers that to its own, still-unresolved
// "category taxonomy" dependency at the genre level.
//
// "Audio" and "Video" collapse into "AudioVideo" rather than staying
// separate buckets: verified against real data that they overwhelmingly
// co-occur with "AudioVideo" itself (147 apps carry both Audio and
// AudioVideo; only 23 carry Audio alone, 3 Video alone) — three
// near-identical buckets would fragment what's really one content type.
const CATEGORY_LABELS: Record<string, string> = {
  Development: "Developer tools",
  Science: "Science",
  Education: "Education",
  Graphics: "Graphics & Creativity",
  AudioVideo: "Multimedia",
  Audio: "Multimedia",
  Video: "Multimedia",
  Office: "Productivity",
  Network: "Internet & Communication",
  System: "System tools",
  Settings: "Settings",
  Utility: "Utilities",
};

// Preference order when a package carries more than one Main Category —
// real data shows this is common (749 of 3,240 Flathub components, e.g.
// "Office"+"Utility" 59 times, "Development"+"Utility" 44 times) almost
// always pairing a specific category with "Utility", freedesktop's own
// generic catch-all bucket ("small utility programs" per the spec) — so
// Utility is ordered last, deliberately losing to anything more specific.
// The rest of the order isn't load-bearing in the same way (no single
// combination dominates enough to justify optimizing for it specifically)
// but is kept stable so the same package always resolves to the same
// category.
const CATEGORY_PREFERENCE = [
  "Development",
  "Science",
  "Education",
  "Graphics",
  "AudioVideo",
  "Audio",
  "Video",
  "Office",
  "Network",
  "System",
  "Settings",
  "Utility",
];

/**
 * Picks one display-ready category label from a package's raw
 * freedesktop.org category list, per `CATEGORY_PREFERENCE` — `undefined`
 * when none of its categories are a recognized Main Category (e.g.
 * Game-only, or an Additional-Category-only package neither this
 * taxonomy nor `CatalogApp.contentType` covers yet). Pure — no I/O.
 */
export function pickCategory(categories: string[]): string | undefined {
  const present = new Set(categories);
  const match = CATEGORY_PREFERENCE.find((category) => present.has(category));
  return match ? CATEGORY_LABELS[match] : undefined;
}
