// freedesktop.org's menu spec (spec.freedesktop.org/menu-spec) registers 13
// "Main Categories" every app is expected to carry at least one of, plus a
// long tail of "Additional Categories" (subgenres like ArcadeGame,
// TextEditor, WebBrowser, ...). This taxonomy uses the Main Categories only
// — a narrower, more conservative first slice than trying to also map the
// much larger, far less consistently-used Additional Categories set.
// Cross-checked against Microsoft Store's own published taxonomy and the
// original homepage spec's section names (productivité, musique,
// créativité, ...) for the display labels below — full adoption of
// either would be overkill for Tuxery's current catalog size.
//
// "Game" is deliberately excluded: `CatalogApp.contentType` already
// covers it, and genre-level game categorization (ArcadeGame, Shooter,
// Strategy, ...) is out of scope here — see the "Apps page and Games
// page" card, which explicitly defers that to its own, still-unresolved
// "category taxonomy" dependency at the genre level.
//
// "Audio" and "Video" collapse into "AudioVideo" rather than staying
// separate buckets: they overwhelmingly co-occur with "AudioVideo" itself
// on real data — three near-identical buckets would fragment what's
// really one content type.
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
// common on real data, almost always pairing a specific category with
// "Utility", freedesktop's own generic catch-all bucket ("small utility
// programs" per the spec) — so Utility is ordered last, deliberately
// losing to anything more specific. The rest of the order isn't
// load-bearing in the same way but is kept stable so the same package
// always resolves to the same category.
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
