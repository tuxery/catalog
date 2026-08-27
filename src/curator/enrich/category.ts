import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Two separate taxonomies, not one shared list — apps and games draw from
// genuinely different upstream signals (freedesktop.org's Main Categories
// for apps, its far sparser Additional Categories genre tags for games)
// and a flat single-namespace label ("Simulation" the app vs. "Simulation"
// the genre) would blur what's actually two different classification
// questions. Researched against Snapcraft/Flathub/Microsoft Store/Apple
// App Store/Google Play (2026-08-27) — every store that formalizes an
// app/game split (Google Play's "Application type", most directly) scopes
// categories to the type, never one shared list.
//
// The mappings themselves live in `config/categories-apps.json` and
// `config/categories-games.json`, not here — no TypeScript knowledge
// needed to add/relabel a category. Key order in each file is preference
// order (see `*_CATEGORY_PREFERENCE` below) — more specific tags listed
// before generic catch-alls.
const APP_CATEGORY_LABELS: Record<string, string> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../config/categories-apps.json", import.meta.url)),
    "utf8",
  ),
);
const GAME_CATEGORY_LABELS: Record<string, string> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../config/categories-games.json", import.meta.url)),
    "utf8",
  ),
);

const APP_CATEGORY_PREFERENCE = Object.keys(APP_CATEGORY_LABELS);
const GAME_CATEGORY_PREFERENCE = Object.keys(GAME_CATEGORY_LABELS);

// The freedesktop.org Additional Categories genre tags real game data
// actually carries (verified live against Flathub/AppCenter's real cache,
// 2026-08-27: 410 of 777 tagged games carry at least one, the rest have
// only the bare "Game" Main Category or nothing recognized at all — those
// fall to `TO_CLASSIFY` below, same as any app with no signal). Casino,
// Casual, Music, Racing, Trivia, and Word have zero real matches in
// today's data (no source populates them yet — Flathub/AppCenter's own
// AppStream categories are the only per-package genre signal that exists;
// GOG/Lutris carry no equivalent field, see `SourcedPackage`) but are
// still real, legitimate genres a future signal could populate — kept out
// of `config/categories-games.json` rather than force-mapped to the
// nearest real tag, per this file's "never guessed" discipline.
//
// "Shooter" folds into "Action" (a real freedesktop Additional Category,
// distinct from "ActionGame" but the same genre family in every real
// store's own taxonomy — Steam files Shooter under Action too).
// "BlocksGame"/"LogicGame" fold into "Puzzle" (block-stacking and logic
// games are both puzzle games in every real store researched). "KidsGame"
// and the freedesktop "Education" Main Category (real co-occurrence with
// "Game" on real data) both fold into "Educational".
export function pickCategory(categories: string[], isGame: boolean): string {
  const present = new Set(categories);
  const labels = isGame ? GAME_CATEGORY_LABELS : APP_CATEGORY_LABELS;
  const preference = isGame ? GAME_CATEGORY_PREFERENCE : APP_CATEGORY_PREFERENCE;
  const match = preference.find((category) => present.has(category));
  return (match && labels[match]) || TO_CLASSIFY;
}

/**
 * The fallback category for anything with no positive signal at all —
 * `pickCategory` never returns `undefined`, so `CatalogApp.category` is
 * always a real string and the catalog stays fully browsable by category
 * even for the ~98% of apps that carry no Flathub/AppCenter member at all
 * (verified live, 2026-08-27: only 3,406 of 202,979 apps do — every other
 * source is silent on category entirely). Explicit product decision, not
 * a stopgap: "everything must be classified, at worst as 'needs help'"
 * rather than leaving most of the catalog with no category at all.
 */
export const TO_CLASSIFY = "To Classify";
