import type { SourcedPackage } from "../../sources";
import type { AppCategoryLabel, GameCategoryLabel } from "./category";

// AUR packagers tag their packages with free-form `Keywords` — the only
// per-package classification metadata the AUR carries at all (no
// sections, no freedesktop categories). Free-form means most keywords
// are noise (form-factor: cli/tui/gui/electron; implementation language:
// python/rust/go/...; desktop-technology: gnome/kde/gtk/qt/wayland/x11),
// but a verified subset is a real domain label, sampled live against the
// refreshed cache (2026-09-03, 118,655 entries) before trusting — same
// per-value discipline as category-section.ts's Section mappings.
// Sampled and REJECTED, checked and rejected: terminal (2048-games and
// terminal emulators ride the same tag), network (DNS servers next to
// neural-network libraries), video (GPU settings tools next to video
// editors), education (~50% real), editor (video/map/code/text editors
// share it), git (marks -git *build variants*, not VCS tooling),
// discord/chat (interop tooling: an Apple Music client riding Discord
// RPC), browser (~70%, markdown previewers and wiki TUIs ride along),
// manager/player/library/ai/llm/indie/retro (ambiguous or not a domain).
const AUR_KEYWORD_TO_APP_CATEGORY: Record<string, AppCategoryLabel> = {
  emulator: "System Tools",
  emulation: "System Tools",
  minecraft: "System Tools",
  backup: "System Tools",
  bluetooth: "System Tools",
  printer: "System Tools",
  ssh: "System Tools",
  docker: "Developer Tools",
  security: "Security",
  vpn: "Security",
  proxy: "Security",
  calculator: "Utilities",
  wine: "Utilities",
  dictionary: "Books & Reference",
  wiki: "Books & Reference",
  science: "Science",
  audio: "Music & Audio",
  music: "Music & Audio",
  font: "Graphics & Design",
  fonts: "Graphics & Design",
  ttf: "Graphics & Design",
  theme: "Graphics & Design",
  themes: "Graphics & Design",
  icons: "Graphics & Design",
  icon: "Graphics & Design",
  telegram: "Internet & Communication",
};

// The same sampling run, game-genre side: AUR keywords that name a real
// genre in categories-games.json's own taxonomy. `simulation`'s 78
// matches include genuinely-not-games (abstreet, a traffic-planning
// tool) — accepted at the same tolerance as the description-side genre
// rules, and only ever reached by packages already flagged as games
// through some positive evidence, never as game evidence itself.
// Sampled and REJECTED: indie/retro (distribution/era, not a genre),
// platform (OS platform vs platform game — ambiguous at 11 matches).
const AUR_KEYWORD_TO_GAME_GENRE: Record<string, GameCategoryLabel> = {
  rpg: "Role-Playing",
  roguelike: "Role-Playing",
  "rogue-like": "Role-Playing",
  mmorpg: "Role-Playing",
  mmo: "Role-Playing",
  strategy: "Strategy",
  puzzle: "Puzzle",
  quiz: "Puzzle",
  arcade: "Arcade",
  shooter: "Action",
  fps: "Action",
  action: "Action",
  platformer: "Action",
  simulation: "Simulation",
  racing: "Sports",
  adventure: "Adventure",
  boardgame: "Board & Cards",
};

// Packages carrying one of these keywords alongside `game`/`games` are
// tools *for* games mislabeled with the domain tag — verified live:
// every tool-ish name in the 927-package `game` bucket rides one
// (am2rlauncher [launcher,patcher], airshipper [launcher], alvr
// [streaming], minigalaxy [client], ...), while real games never do.
// Mirrors the description-side strip in enrich/index.ts's
// isGameAdjacentToolDescription, just in keyword space.
const AUR_TOOL_KEYWORDS = new Set([
  "launcher",
  "patcher",
  "streaming",
  "frontend",
  "wrapper",
  "manager",
  "server",
  "daemon",
  "driver",
  "library",
  "plugin",
  "module",
  "client",
]);

function keywordsOf(pkg: SourcedPackage): string[] | undefined {
  const keywords = pkg.keywords;
  return keywords && keywords.length > 0
    ? keywords.map((keyword) => keyword.toLowerCase())
    : undefined;
}

/**
 * A category inferred from an AUR package's own packager keywords — see
 * `AUR_KEYWORD_TO_APP_CATEGORY` above for the live-data research behind
 * each mapping. Deliberately returns undefined for packages tagged
 * `game`/`games` (they resolve through the game path — genre via
 * `gameGenreFromAurKeywords`, or "To Classify" as games, never an
 * app-taxonomy category) and for tool-keyworded packages.
 */
export function categoryFromAurKeywords(pkg: SourcedPackage): AppCategoryLabel | undefined {
  if (pkg.source !== "pacman-aur") return undefined;
  const keywords = keywordsOf(pkg);
  if (!keywords) return undefined;
  if (keywords.some((keyword) => keyword === "game" || keyword === "games")) return undefined;
  return keywords
    .map((keyword) => AUR_KEYWORD_TO_APP_CATEGORY[keyword])
    .find((category) => category !== undefined);
}

/** A game genre inferred from an AUR package's own packager keywords — see `AUR_KEYWORD_TO_GAME_GENRE` above for the live-data research behind each mapping. */
export function gameGenreFromAurKeywords(pkg: SourcedPackage): GameCategoryLabel | undefined {
  if (pkg.source !== "pacman-aur") return undefined;
  const keywords = keywordsOf(pkg);
  if (!keywords) return undefined;
  return keywords
    .map((keyword) => AUR_KEYWORD_TO_GAME_GENRE[keyword])
    .find((genre) => genre !== undefined);
}

/**
 * Positive game evidence from the AUR's own `game`/`games` keyword —
 * the keyword-space counterpart to `hasGameCategory`'s AppStream
 * signal, verified live (2026-09-03): 927 packages carry it, 8-of-8
 * sampled real games. Guarded by `AUR_TOOL_KEYWORDS`: a package tagged
 * both `game` and a tool word (launcher/patcher/streaming/...) is a
 * tool for games mislabeled with the domain tag — every tool-ish name
 * in the bucket rides one, and real games never do.
 */
export function hasAurKeywordGameEvidence(pkg: SourcedPackage): boolean {
  if (pkg.source !== "pacman-aur") return false;
  const keywords = keywordsOf(pkg);
  if (!keywords) return false;
  if (!keywords.some((keyword) => keyword === "game" || keyword === "games")) return false;
  return !keywords.some((keyword) => AUR_TOOL_KEYWORDS.has(keyword));
}
