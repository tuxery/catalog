import type { SourcedPackage } from "../../sources";
import { looksLikeGuiPackage } from "../filter/rules";
import type { AppCategoryLabel, GameCategoryLabel } from "./category";

// Debian/Ubuntu's own Section field, for the exact subset filter/rules.ts's
// GUI_SECTIONS already verified as reliably GUI-predictive (see that
// file's own comment for the sampling behind "sound"/"editors"/"video"/
// "graphics"/"math"/"science"/"hamradio" specifically) — reused here for a
// second purpose. The section name itself is close enough to an
// app-taxonomy category to assign one directly, for the ~186,000-strong
// "To Classify" apps with no upstream category signal and no
// category-rules.json name match either: verified live, 3,846 real
// matches (OBS Studio -> video, Qalculate! -> math, PyQSO/CubicSDR/qDMR ->
// hamradio, universal-ctags -> editors, RHVoice/abcde/aften -> sound,
// DarkRadiant/Tulip/HDRMerge -> graphics, Jmol/llama-cpp/Stacks ->
// science). "games"/"contrib/games" are deliberately excluded here —
// those drive game *detection* (`looksLikeGamePackage`), not an
// app-taxonomy category.
const DEBIAN_SECTION_TO_APP_CATEGORY: Partial<Record<string, AppCategoryLabel>> = {
  sound: "Music & Audio",
  video: "Photo & Video",
  graphics: "Graphics & Design",
  math: "Science",
  science: "Science",
  // No amateur-radio category exists in our taxonomy; radio communication
  // tooling (SDR receivers, APRS/Morse encoders, ham radio loggers) is
  // conceptually closest to freedesktop's own Telephony/TelephonyTools
  // keys, which already map to Internet & Communication.
  hamradio: "Internet & Communication",
  // Matches this file's own freedesktop TextEditor key, already mapped to
  // Utilities rather than Developer Tools — kept consistent rather than
  // splitting general text editors from programmer-focused ones, which
  // Debian's own Section can't tell apart anyway.
  editors: "Utilities",
};

/**
 * A category inferred from a Debian/Ubuntu package's own Section field —
 * gated on `looksLikeGuiPackage` so the same noise-name/companion-suffix
 * exclusions (`-data`/`-common`/`-plugins`/`-server`/`-icons`, `-dev`/
 * `-doc`/`lib*`/...) that already keep GUI detection honest apply here
 * too, not just raw section membership.
 */
export function categoryFromDebianSection(pkg: SourcedPackage): AppCategoryLabel | undefined {
  if (pkg.source !== "deb-debian" && pkg.source !== "deb-ubuntu") return undefined;
  if (!pkg.section) return undefined;
  if (!looksLikeGuiPackage(pkg.name, pkg.section)) return undefined;
  return DEBIAN_SECTION_TO_APP_CATEGORY[pkg.section];
}

// Gentoo's own top-level category (SourcedPackage.section) — its
// `games-*` prefix is already Portage's own genre taxonomy (see
// filter/rules.ts's looksLikeGamePackage), and several of the rest are
// coherent enough by category alone to assign an app-taxonomy category
// directly, no filter/rules.ts's GENTOO_NOISE_CATEGORIES exclusion needed
// first (that already removed the sections that don't belong here —
// sec-keys, app-dicts, x11-themes, media-fonts, app-emacs — before this
// ever runs). Verified live against real "To Classify" samples:
// - `sci-*` (any sci- subcategory) -> Science, same "unambiguous by
//   category" reasoning as Debian's own "science"/"math" sections.
// - `media-sound`/`media-radio` -> Music & Audio, `media-video`/
//   `media-tv` -> Photo & Video, `media-gfx` -> Graphics & Design.
// - `net-mail`/`net-irc`/`net-im`/`net-p2p`/`net-voip`/`net-news`/
//   `net-nntp`/`net-ftp`/`www-apps` -> Internet & Communication (mail/
//   chat/P2P/VoIP/Usenet/FTP clients, and real self-hostable web software
//   like Hugo/MediaWiki/selfoss/ttyd).
// - `net-firewall`/`net-vpn`/`app-crypt` -> Security.
// - `net-analyzer`/`net-print`/`app-arch`/`app-admin`/`x11-apps`/
//   `app-emulation` -> System Tools (network diagnostics, printing,
//   archiving, sysadmin tools, real X11 client apps like xrandr/xkill,
//   emulation/virtualization tooling — same family qemu-*/category-rules
//   already covers).
// - `app-text` -> Utilities, same TextTools -> Utilities precedent as
//   Debian's own "editors" mapping.
// - `dev-vcs` -> Developer Tools (kdesvn, breezy, mr, rcs, ... — a couple
//   of real counter-examples exist, e.g. "jj" mislabeled by Gentoo itself
//   as an XMPP client despite the dev-vcs section, accepted at the same
//   tolerance as everywhere else in this file).
// Deliberately NOT included, checked and rejected — too mixed with
// libraries/plugins to trust by category alone, same trap as everywhere
// else in this file: dev-* (perl/python/ruby/haskell/libs/util/java/ml/
// lang/db/cpp/php), app-misc, x11-misc, sys-apps, sys-fs, sys-block,
// net-misc, net-libs, net-wireless (mostly SDR libraries/plugins),
// net-dns/net-dialup/net-fs/net-nds/net-proxy (too niche/ambiguous),
// media-libs, kde-apps/kde-frameworks/kde-plasma/app-vim/app-xemacs
// (needs a host, same trap as elpa-/kwin-/gnome-shell-extension-),
// app-i18n (real input-method frameworks mixed with dictionary data).
const GENTOO_SECTION_TO_APP_CATEGORY: Partial<Record<string, AppCategoryLabel>> = {
  "media-sound": "Music & Audio",
  "media-radio": "Music & Audio",
  "media-video": "Photo & Video",
  "media-tv": "Photo & Video",
  "media-gfx": "Graphics & Design",
  "net-mail": "Internet & Communication",
  "net-irc": "Internet & Communication",
  "net-im": "Internet & Communication",
  "net-p2p": "Internet & Communication",
  "net-voip": "Internet & Communication",
  "net-news": "Internet & Communication",
  "net-nntp": "Internet & Communication",
  "net-ftp": "Internet & Communication",
  "www-apps": "Internet & Communication",
  "net-firewall": "Security",
  "net-vpn": "Security",
  "app-crypt": "Security",
  "net-analyzer": "System Tools",
  "net-print": "System Tools",
  "app-arch": "System Tools",
  "app-admin": "System Tools",
  "x11-apps": "System Tools",
  "app-emulation": "System Tools",
  "app-text": "Utilities",
  "dev-vcs": "Developer Tools",
};

/** A category inferred from a Gentoo package's own top-level category — see `GENTOO_SECTION_TO_APP_CATEGORY` above for the live-data research behind each mapping. */
export function categoryFromGentooSection(pkg: SourcedPackage): AppCategoryLabel | undefined {
  if (pkg.source !== "ebuild-gentoo" || !pkg.section) return undefined;
  const sciPrefix = pkg.section.startsWith("sci-") ? "Science" : undefined;
  return sciPrefix ?? GENTOO_SECTION_TO_APP_CATEGORY[pkg.section];
}

// Gentoo's own `games-*` subcategory (see filter/rules.ts's
// looksLikeGamePackage, which already uses this exact prefix to detect
// that a package is a game at all) — several subcategories are specific
// enough to also predict a genre in `categories-games.json`'s own
// taxonomy, verified live against real samples: games-arcade,
// games-board (gnubg, crafty, gnushogi, openyahtzee, ... -> Board &
// Cards), games-rpg/games-roguelike/games-mud (bastion, wasteland2,
// zangband, dwarffortress, nethack-git, MUD clients like tintin/tf/mudix
// -> Role-Playing, the closest genre for text-adventure-descended MUD
// clients too), games-strategy, games-simulation, games-sports,
// games-fps (folds into Action, same "Shooter" reasoning
// category.ts already applies to Flathub's own genre tag), games-kids
// (folds into Educational, same KidsGame reasoning category.ts already
// applies). Deliberately excluded: games-emulation (an emulator is a
// tool to play games, not itself a game with a genre), games-util/
// games-misc/games-engines/games-server (support tooling, not games).
const GENTOO_GAME_SECTION_TO_GENRE: Partial<Record<string, GameCategoryLabel>> = {
  "games-arcade": "Arcade",
  "games-action": "Action",
  "games-fps": "Action",
  "games-board": "Board & Cards",
  "games-rpg": "Role-Playing",
  "games-roguelike": "Role-Playing",
  "games-mud": "Role-Playing",
  "games-strategy": "Strategy",
  "games-simulation": "Simulation",
  "games-sports": "Sports",
  "games-kids": "Educational",
};

/** A game genre inferred from a Gentoo package's own `games-*` subcategory — see `GENTOO_GAME_SECTION_TO_GENRE` above for the live-data research behind each mapping. */
export function gameGenreFromGentooSection(pkg: SourcedPackage): GameCategoryLabel | undefined {
  if (pkg.source !== "ebuild-gentoo" || !pkg.section) return undefined;
  return GENTOO_GAME_SECTION_TO_GENRE[pkg.section];
}
