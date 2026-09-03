import type { SourcedPackage } from "../../sources";
import { looksLikeCompanionPackage, looksLikeSupportPackage } from "../filter/rules";
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

// The much larger CLI-flavored half of Debian/Ubuntu's Section
// vocabulary — sections that don't predict a *launchable GUI* (so they
// can't join GUI_SECTIONS above without breaking GUI detection) but are
// still coherent enough by section alone to assign an app-taxonomy
// category, for the tens of thousands of "To Classify" packages riding
// them (verified live against the real pool, 2026-09-03, sampled per
// section before trusting). Gated on `looksLikeSupportPackage` +
// `looksLikeCompanionPackage` (NOT on GUI_SECTIONS membership) so the
// noise-name/companion-suffix exclusions that keep the GUI-gated mapping
// honest apply here too. Deliberately NOT included, checked and rejected:
// "misc" (Debian's own doesn't-fit-anywhere fallback — appstream-generator,
// ddgr, goldencheetah, agda ride the same value), "metapackages" (blend
// task packages mixing astro tool sets with desktop metas and plugin
// bundles), "localization" (language-pack data), "libs"/"oldlibs"
// (libraries — the name-based filter already removes nearly all of them).
// "games"/"contrib/games" stay excluded — those drive game *detection*
// (`looksLikeGamePackage`), not an app-taxonomy category.
const DEBIAN_UNGATED_SECTION_TO_APP_CATEGORY: Partial<Record<string, AppCategoryLabel>> = {
  utils: "Utilities",
  text: "Utilities",
  net: "Internet & Communication",
  mail: "Internet & Communication",
  web: "Internet & Communication",
  comm: "Internet & Communication",
  admin: "System Tools",
  x11: "System Tools",
  otherosfs: "System Tools",
  devel: "Developer Tools",
  python: "Developer Tools",
  java: "Developer Tools",
  golang: "Developer Tools",
  perl: "Developer Tools",
  lisp: "Developer Tools",
  interpreters: "Developer Tools",
  database: "Developer Tools",
  electronics: "Science",
  tex: "Productivity",
  gnome: "Settings",
  kde: "Settings",
  fonts: "Graphics & Design",
  doc: "Books & Reference",
};

/**
 * A category inferred from a Debian/Ubuntu package's own Section field —
 * two tiers, both gated on `looksLikeSupportPackage`'s noise-name
 * exclusions (and, on the second tier, `looksLikeCompanionPackage`'s
 * companion-suffix exclusions):
 * - the original GUI-gated tier for the sections verified as reliably
 *   GUI-predictive (see `DEBIAN_SECTION_TO_APP_CATEGORY`), via
 *   `looksLikeGuiPackage`;
 * - a second tier for the much larger CLI-flavored sections
 *   (utils/net/admin/...) — see `DEBIAN_UNGATED_SECTION_TO_APP_CATEGORY`
 *   for the per-section sampling behind them. "misc"/"metapackages" stay
 *   unmapped on purpose, and every name a support/companion pattern
 *   claims (libfoo-dev, imagemagick-7-common, ...) resolves via the
 *   companion-name inheritance pass instead, never by section.
 */
export function categoryFromDebianSection(pkg: SourcedPackage): AppCategoryLabel | undefined {
  if (pkg.source !== "deb-debian" && pkg.source !== "deb-ubuntu") return undefined;
  if (!pkg.section) return undefined;
  // Both tiers share the same name-level exclusions: a support name
  // (libfoo-dev) or companion name (imagemagick-7-common) never resolves
  // by section, GUI-predictive or not — it resolves via the companion-name
  // inheritance pass instead. After these two gates, table membership is
  // the only remaining difference between the tiers, so the original
  // `looksLikeGuiPackage` call (GUI_SECTIONS membership + the same two
  // name checks) collapses into the first lookup below.
  if (looksLikeSupportPackage(pkg.name) || looksLikeCompanionPackage(pkg.name)) return undefined;
  return (
    DEBIAN_SECTION_TO_APP_CATEGORY[pkg.section] ??
    DEBIAN_UNGATED_SECTION_TO_APP_CATEGORY[pkg.section]
  );
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
// The first wave deliberately stopped there — "dev-*/sys-*/app-misc too
// mixed with libraries to trust by category alone" was a precision call
// made when those packages were headed for "To Classify" anyway. With
// "everything must be classified, at worst with a real category" now the
// explicit product goal (2026-09-03), the second wave below resolves the
// rest by their own Portage taxonomy: a dev-python module and a
// dev-python CLI tool are both developer resources, a sys-fs tool is
// system infrastructure. The name-based filter has already removed the
// worst library pollution (lib*/-dev/-doc naming) before this ever runs,
// and what remains after sampling is coherent enough by category — see
// `GENTOO_SECTION_TO_APP_CATEGORY`'s second-wave entries and the prefix
// table below for the per-family reasoning.
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
  // Second wave (2026-09-03, "To Classify" 0% goal) — each value sampled
  // against the real "To Classify" pool before trusting; see the prefix
  // table below for the reasoning behind the families these belong to.
  "net-misc": "Internet & Communication",
  "net-dns": "Internet & Communication",
  "net-proxy": "Internet & Communication",
  "net-dialup": "Internet & Communication",
  "net-nds": "Internet & Communication",
  "net-wireless": "Internet & Communication",
  "net-fs": "System Tools",
  "www-client": "Internet & Communication",
  "www-servers": "Internet & Communication",
  "www-apache": "Internet & Communication",
  "www-misc": "Internet & Communication",
  "mail-mta": "Internet & Communication",
  "mail-filter": "Internet & Communication",
  "mail-client": "Internet & Communication",
  "app-mobilephone": "Internet & Communication",
  "sys-apps": "System Tools",
  "sys-fs": "System Tools",
  "sys-block": "System Tools",
  "sys-process": "System Tools",
  "sys-cluster": "System Tools",
  "sys-power": "System Tools",
  "sys-kernel": "System Tools",
  "sys-boot": "System Tools",
  "sys-auth": "System Tools",
  "sys-devel": "System Tools",
  "app-shells": "System Tools",
  "app-portage": "System Tools",
  "app-i18n": "System Tools",
  "app-laptop": "System Tools",
  "app-pda": "System Tools",
  "app-backup": "System Tools",
  "app-forensics": "System Tools",
  "x11-misc": "System Tools",
  "x11-terms": "System Tools",
  "gui-apps": "System Tools",
  "games-util": "System Tools",
  "games-emulation": "System Tools",
  "games-server": "System Tools",
  "app-misc": "Utilities",
  "app-editors": "Utilities",
  "app-containers": "Developer Tools",
  "app-benchmarks": "Developer Tools",
  "media-libs": "Developer Tools",
  "gui-libs": "Developer Tools",
  "perl-core": "Developer Tools",
  "llvm-core": "Developer Tools",
  "app-cdr": "Photo & Video",
  "app-office": "Productivity",
  "dev-gap": "Science",
  "dev-tex": "Productivity",
  "app-accessibility": "Settings",
  "kde-apps": "Settings",
  "kde-plasma": "Settings",
  "kde-misc": "Settings",
  "gnome-base": "Settings",
  "gnome-extra": "Settings",
  "lxde-base": "Settings",
};

// Everything else in Portage's own taxonomy resolves coherently by
// family prefix — sampled live per family before trusting: dev-* ->
// Developer Tools (python/haskell/ruby/java/libs/util/ml/lang/php/cpp/
// db/embedded/tcltk/scheme/lua/erlang/ada/lisp/debug/dotnet/go/build/qt
// — modules and CLI tools are both developer resources), with the two
// exact exceptions already in the table above (dev-gap -> Science,
// dev-tex -> Productivity); sys-* -> System Tools; x11-* -> System
// Tools (x11-libs/x11-themes are already excluded by
// GENTOO_NOISE_CATEGORIES before this runs); remaining net-* ->
// Internet & Communication (the exact net-firewall/net-vpn -> Security
// and net-analyzer/net-print/net-fs -> System Tools entries above win
// first); www-* / mail-* -> Internet & Communication; kde-* / gnome-* /
// mate-* / xfce-* / lxde-* -> Settings, same desktop-environment
// reasoning as the kde-*/gnome-* name rules in category-rules.json.
const GENTOO_SECTION_PREFIX_TO_APP_CATEGORY: [prefix: string, category: AppCategoryLabel][] = [
  ["dev-", "Developer Tools"],
  ["sys-", "System Tools"],
  ["x11-", "System Tools"],
  ["net-", "Internet & Communication"],
  ["www-", "Internet & Communication"],
  ["mail-", "Internet & Communication"],
  ["kde-", "Settings"],
  ["gnome-", "Settings"],
  ["mate-", "Settings"],
  ["xfce-", "Settings"],
  ["lxde-", "Settings"],
];

/** A category inferred from a Gentoo package's own top-level category — see `GENTOO_SECTION_TO_APP_CATEGORY` and `GENTOO_SECTION_PREFIX_TO_APP_CATEGORY` above for the live-data research behind each mapping. `sci-*` still wins over everything, then exact entries, then family prefixes. */
export function categoryFromGentooSection(pkg: SourcedPackage): AppCategoryLabel | undefined {
  if (pkg.source !== "ebuild-gentoo" || !pkg.section) return undefined;
  if (pkg.section.startsWith("sci-")) return "Science";
  const exact = GENTOO_SECTION_TO_APP_CATEGORY[pkg.section];
  if (exact) return exact;
  return GENTOO_SECTION_PREFIX_TO_APP_CATEGORY.find(([prefix]) =>
    pkg.section?.startsWith(prefix),
  )?.[1];
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
// games-puzzle (Anagramarama, GNOME Sudoku, Quadrapassel, ... -> Puzzle)
// was added later, verified live: 100% real puzzle games.
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
  "games-puzzle": "Puzzle",
};

/** A game genre inferred from a Gentoo package's own `games-*` subcategory — see `GENTOO_GAME_SECTION_TO_GENRE` above for the live-data research behind each mapping. */
export function gameGenreFromGentooSection(pkg: SourcedPackage): GameCategoryLabel | undefined {
  if (pkg.source !== "ebuild-gentoo" || !pkg.section) return undefined;
  return GENTOO_GAME_SECTION_TO_GENRE[pkg.section];
}

// openSUSE's own hierarchical `<rpm:group>` value (SourcedPackage.section)
// — far richer than Debian's flat vocabulary (244 distinct values seen
// live in "To Classify" alone). Three leaf namespaces were verified
// uniform enough across every child to trust by prefix: Productivity/
// Scientific/* (Math, Physics, ... -> Science), Productivity/Multimedia/
// Sound/* (Players, Utilities -> Music & Audio), Productivity/Graphics/*
// (Viewers, Other -> Graphics & Design). The rest are exact leaf matches,
// verified individually the same way as everywhere else in this file:
// - `Productivity/Text/Editors`/`Productivity/Text/Utilities` -> Utilities
//   (same TextEditor/TextTools precedent as Debian's own "editors"
//   mapping); deliberately NOT `Productivity/Text/Spell` — that's
//   aspell-/ispell- dictionary data, already excluded via filter/rules.ts.
// - `Productivity/Networking/Security`/`Productivity/Security` -> Security.
// - `Development/Tools/Version Control`/`Development/Tools/Debuggers` ->
//   Developer Tools (gitslave/forgejo-longterm, lldb/valgrind-git/
//   cgdb-git — real tools, unlike the broader Development/* namespace
//   this file already rejects elsewhere for mixing in libraries).
// - `System/X11/Utilities`/`Productivity/File utilities`/`Productivity/
//   Networking/Diagnostic`/`Hardware/Printing`/`Productivity/Archiving/
//   Backup` -> System Tools (real X11 client apps, file utilities,
//   network diagnostics, printer drivers/PPDs — same family brother-*/
//   qemu-*/category-rules.json already covers — and backup tools).
// The first wave deliberately stopped there — "Development/Libraries
// too mixed with libraries" was a precision call made when those
// packages were headed for "To Classify" anyway. With "everything must
// be classified, at worst with a real category" now the explicit
// product goal (2026-09-03), the second wave below resolves the rest by
// their own group taxonomy, sampled live per family against the real
// "To Classify" pool before trusting (see the prefix table): a
// Development/Libraries/Java jar and a Development/Tools/Other CLI are
// both developer resources; System/* is system infrastructure;
// Productivity/Networking/* is the network domain (the exact
// Security/Diagnostic entries above still win first). "Unspecified"
// (the largest single value — no signal, stays unmapped) and
// Productivity/Multimedia/Other (dvdisaster disc tooling, celt audio
// codecs and grilo media plugins ride the same value) stay rejected.
const OPENSUSE_GROUP_TO_APP_CATEGORY: Partial<Record<string, AppCategoryLabel>> = {
  "Productivity/Text/Editors": "Utilities",
  "Productivity/Text/Utilities": "Utilities",
  "Productivity/Networking/Security": "Security",
  "Productivity/Security": "Security",
  "Development/Tools/Version Control": "Developer Tools",
  "Development/Tools/Debuggers": "Developer Tools",
  "System/X11/Utilities": "System Tools",
  "Productivity/File utilities": "System Tools",
  "Productivity/Networking/Diagnostic": "System Tools",
  "Hardware/Printing": "System Tools",
  "Productivity/Archiving/Backup": "System Tools",
  // Second wave (2026-09-03, "To Classify" 0% goal), each sampled live:
  // System/YaST (numlockx/autoyast2 — YaST control-center modules, same
  // reasoning as the yast2-* name rules) and System/GUI/GNOME (zenity/
  // alacarte/caribou — desktop-environment components) -> Settings;
  // System/Benchmark (hardinfo2/phoronix-test-suite/iometer — same
  // "benchmark" family description-category-rules already resolves to
  // Developer Tools) -> Developer Tools; Productivity/Other (clinfo/
  // abook/cheat/gmrun — general utilities) -> Utilities.
  "System/YaST": "Settings",
  "System/GUI/GNOME": "Settings",
  "System/Benchmark": "Developer Tools",
  "Productivity/Other": "Utilities",
};

const OPENSUSE_GROUP_PREFIX_TO_APP_CATEGORY: [prefix: string, category: AppCategoryLabel][] = [
  ["Productivity/Scientific/", "Science"],
  ["Productivity/Multimedia/Sound/", "Music & Audio"],
  ["Productivity/Graphics/", "Graphics & Design"],
  // Second wave (2026-09-03, "To Classify" 0% goal), sampled live per
  // family: Development/* (Libraries/Java jars, Languages compilers,
  // Tools build systems — all developer resources; the exact
  // Version Control/Debuggers entries above still win first) ->
  // Developer Tools; System/* (Management/Base/Filesystems/Daemons/
  // Kernel/Fhs/Console/Shells/Boot/Packages/Monitoring — btop,
  // coreutils, dosfstools, avahi, kmod, rpm tooling; the exact YaST/
  // GUI/Benchmark/X11 entries above win first) and Hardware/* (usbutils/
  // canutils/ckb-next) -> System Tools; Productivity/Networking/*
  // (mosquitto/chrony/darkhttpd/bind/sendmail/ddgr — the network
  // domain, servers included) -> Internet & Communication; Productivity/
  // Clustering/* (corosync/drbd/booth) -> System Tools; Productivity/
  // Office/* and Productivity/Publishing/* -> Productivity and Books &
  // Reference, the same Office/Publishing freedesktop-key reasoning as
  // config/categories-apps.json; Productivity/Archiving/* (beyond the
  // Backup leaf above) and Productivity/Databases/* (PostgreSQL/MySQL
  // ecosystem tooling — same needs-a-host tolerance as plugins
  // elsewhere) -> System Tools and Developer Tools;
  // Productivity/Multimedia/Video/* -> Photo & Video (same Video-key
  // reasoning as categories-apps.json).
  ["Development/", "Developer Tools"],
  ["System/GUI/", "Settings"],
  ["System/", "System Tools"],
  ["Hardware/", "System Tools"],
  ["Productivity/Networking/", "Internet & Communication"],
  ["Productivity/Clustering/", "System Tools"],
  ["Productivity/Archiving/", "System Tools"],
  ["Productivity/Office/", "Productivity"],
  ["Productivity/Publishing/", "Books & Reference"],
  ["Productivity/Databases/", "Developer Tools"],
  ["Productivity/Multimedia/Video/", "Photo & Video"],
];

/** A category inferred from an openSUSE/RPM Fusion package's own `<rpm:group>` value — see `OPENSUSE_GROUP_TO_APP_CATEGORY`/`OPENSUSE_GROUP_PREFIX_TO_APP_CATEGORY` above for the live-data research behind each mapping. Exact matches win over prefix rules. */
export function categoryFromOpenSuseGroup(pkg: SourcedPackage): AppCategoryLabel | undefined {
  if (pkg.source !== "rpm-opensuse" && pkg.source !== "rpm-rpmfusion") return undefined;
  if (!pkg.section) return undefined;
  const exact = OPENSUSE_GROUP_TO_APP_CATEGORY[pkg.section];
  if (exact) return exact;
  return OPENSUSE_GROUP_PREFIX_TO_APP_CATEGORY.find(([prefix]) =>
    pkg.section?.startsWith(prefix),
  )?.[1];
}

// Solus's own `PartOf` value (`SourcedPackage.section`, same field
// `filter/rules.ts`'s `SOLUS_NOISE_PARTOF` already reads for exclusion —
// this is that field's positive-signal counterpart). Verified live
// against the real "To Classify" set (2026-09-03): four values are
// reliable enough to trust outright —
// `multimedia.audio`/`multimedia.video` (real players/editors/plugins —
// audacious-plugins, cinelerra-gg, decibels, zam-plugins, ...),
// `office.scientific` (EDA/hardware-verification tooling — yosys,
// opensta, openroad, mathjax, ...), and `security` (gufw, usbguard,
// openldap, yubikey-personalization, ...). Checked and rejected: bare
// `office` (mixes real office apps with a 3D-printer slicer, a
// typesetting *language*, and spell-check data — too heterogeneous),
// `multimedia.graphics` (real libraries like `gd`/`kseexpr` slip through
// since this PartOf value doesn't reliably exclude them the way Debian's
// GUI_SECTIONS gate does). `network.clients` was also rejected in the
// first wave — see the second-wave note below for why that changed.
const SOLUS_PARTOF_TO_APP_CATEGORY: Partial<Record<string, AppCategoryLabel>> = {
  "multimedia.audio": "Music & Audio",
  "multimedia.video": "Photo & Video",
  "office.scientific": "Science",
  security: "Security",
  // Second wave (2026-09-03, "To Classify" 0% goal), each value sampled
  // live against the real "To Classify" pool: system.utils/system.base/
  // kernel.drivers/desktop.core (vdpauinfo/dmidecode/usbutils/bash,
  // bbswitch/openrazer, avahi/desktop-file-utils — system
  // infrastructure) -> System Tools; programming.* (tools/python/devel/
  // ide, plus bare "programming" — zig/dub/codespell/autoconf/allegro —
  // modules and tools are both developer resources) and system.devel
  // (autoconf/flex/fakeroot) and virt (buildah/buildkit/distrobox —
  // same container-tooling family as docker*) -> Developer Tools;
  // network.util/network.clients/network.base (getdns/nbd/mosh/ddgr/
  // retroshare — the same "bare system utilities" tolerance the first
  // wave rejected this value for is now accepted: they are still
  // network-domain software) -> Internet & Communication;
  // desktop.kde/desktop.kde.core/desktop.gnome/desktop.gnome.core/
  // desktop.hyprland (bluedevil/drkonqi/alacarte/fcitx —
  // desktop-environment components) -> Settings, same reasoning as the
  // kde-*/gnome-* name rules; office.notes (calcurse-adjacent note
  // apps) -> Productivity; security.library -> Security, same reasoning
  // as bare security; database (getdns-adjacent DB tooling) ->
  // Developer Tools, same reasoning as Debian's own "database" section;
  // binary.compat (Wine/compat-layer packages) -> Utilities, same
  // reasoning as the wine*/proton* name rules.
  "system.utils": "System Tools",
  "system.base": "System Tools",
  "system.devel": "Developer Tools",
  "kernel.drivers": "System Tools",
  "desktop.core": "System Tools",
  programming: "Developer Tools",
  "programming.tools": "Developer Tools",
  "programming.python": "Developer Tools",
  "programming.devel": "Developer Tools",
  "programming.ide": "Developer Tools",
  virt: "Developer Tools",
  "network.util": "Internet & Communication",
  "network.clients": "Internet & Communication",
  "network.base": "Internet & Communication",
  "desktop.kde": "Settings",
  "desktop.kde.core": "Settings",
  "desktop.gnome": "Settings",
  "desktop.gnome.core": "Settings",
  "desktop.hyprland": "Settings",
  "office.notes": "Productivity",
  "security.library": "Security",
  database: "Developer Tools",
  "binary.compat": "Utilities",
  // Still rejected, checked and re-rejected live (2026-09-03): bare
  // "office" (typst next to a scanner driver and a beer-recipe manager —
  // unchanged from the first wave), bare "desktop" (a Wayland
  // compositor, a novelty watermark clone and a brewing app ride the
  // same value), multimedia.graphics (real libraries slip through the
  // same way the first wave found), multimedia.codecs (codec data
  // needing a host).
};

/** A category inferred from a Solus package's own `PartOf` value — see `SOLUS_PARTOF_TO_APP_CATEGORY` above for the live-data research behind each mapping. */
export function categoryFromSolusPartOf(pkg: SourcedPackage): AppCategoryLabel | undefined {
  if (pkg.source !== "eopkg-solus") return undefined;
  if (!pkg.section) return undefined;
  return SOLUS_PARTOF_TO_APP_CATEGORY[pkg.section];
}

// Solus's own `games.*` PartOf subcategories, same genre-prediction
// reasoning as GENTOO_GAME_SECTION_TO_GENRE above — verified live chasing
// the apps/games "To Classify" 0% goal (2026-09-03). games.emulator is
// deliberately excluded entirely (an emulator isn't itself a game, same
// as Gentoo's games-emulation — see looksLikeGamePackage), and
// games.platformer too (only 3 total members, one of them a completely
// unrelated Steam-game backup utility riding the same PartOf value —
// too small and noisy a sample to trust).
const SOLUS_GAME_SECTION_TO_GENRE: Partial<Record<string, GameCategoryLabel>> = {
  "games.action": "Action",
  "games.arcade": "Arcade",
  "games.strategy": "Strategy",
  "games.rpg": "Role-Playing",
  "games.puzzle": "Puzzle",
  "games.card": "Board & Cards",
  "games.learning": "Educational",
};

// Two exact-name false positives riding an otherwise-clean Solus games.*
// PartOf value, found live sampling every member before trusting the
// section: "pacman-git" under games.arcade is the Arch Linux package
// manager (a "pacman" name collision with the arcade game, not the game
// itself), and "dfarc" under games.rpg is a front-end/archiver tool for
// the Dink Smallwood game, not an RPG on its own.
const SOLUS_GAME_SECTION_NAME_EXCEPTIONS = new Set(["pacman-git", "dfarc"]);

/** A game genre inferred from a Solus package's own `games.*` PartOf subcategory — see `SOLUS_GAME_SECTION_TO_GENRE` above for the live-data research behind each mapping. */
export function gameGenreFromSolusSection(pkg: SourcedPackage): GameCategoryLabel | undefined {
  if (pkg.source !== "eopkg-solus" || !pkg.section) return undefined;
  if (SOLUS_GAME_SECTION_NAME_EXCEPTIONS.has(pkg.name)) return undefined;
  return SOLUS_GAME_SECTION_TO_GENRE[pkg.section];
}

// Slackware's own package series (`SourcedPackage.section` — the
// single-letter/short-code directory the package lives in, e.g. "a",
// "ap", "kde"). Slackware has no per-package category metadata at all,
// so the series is the only signal its source provides — and each
// series is coherent by Slackware's own definition (verified live
// against the real "To Classify" pool, 2026-09-03, sampled per series):
// - a (base system: usbutils/acl/bash/bcachefs-tools) and x (X11
//   system: egl-wayland/glew/lndir) -> System Tools.
// - ap (general CLI applications: dmidecode/dash/ghostscript/groff) ->
//   Utilities, the generic catch-all its own definition matches.
// - d (development: clinfo/autoconf/automake/AMF-headers) and tcl
//   (expect/tcl/tix) -> Developer Tools.
// - e (GNU Emacs) -> Utilities, same TextEditor precedent as Debian's
//   "editors" section.
// - f (FAQ/documentation) -> Books & Reference.
// - n (network: mosh/ModemManager/bind/bootp) -> Internet &
//   Communication.
// - t (TeX/LaTeX) -> Productivity, same reasoning as Debian's "tex"
//   section.
// - kde/kdei (the KDE/Plasma shipping series: kdf/kalk/kdebugsettings,
//   plus its i18n half) -> Settings, same desktop-environment-component
//   reasoning as the kde-* name rules in category-rules.json — which
//   already files real KDE apps (kcalc, kdialog, ...) under Settings by
//   name, so the series mapping is consistent with existing behavior.
// Deliberately NOT included: xap (the X-applications series mixes a
// debugger GUI, a window manager, gparted, a web browser and a screen
// recorder — no single category fits), l (libraries — the name filter
// removes nearly all of them), y (the games series — that drives game
// *detection* via looksLikeGamePackage, not an app-taxonomy category).
const SLACKWARE_SERIES_TO_APP_CATEGORY: Partial<Record<string, AppCategoryLabel>> = {
  a: "System Tools",
  ap: "Utilities",
  d: "Developer Tools",
  e: "Utilities",
  f: "Books & Reference",
  kde: "Settings",
  kdei: "Settings",
  l: "System Tools",
  n: "Internet & Communication",
  t: "Productivity",
  tcl: "Developer Tools",
  x: "System Tools",
};

/** A category inferred from a Slackware package's own series — see `SLACKWARE_SERIES_TO_APP_CATEGORY` above for the live-data research behind each mapping. */
export function categoryFromSlackwareSeries(pkg: SourcedPackage): AppCategoryLabel | undefined {
  if (pkg.source !== "slackware" || !pkg.section) return undefined;
  return SLACKWARE_SERIES_TO_APP_CATEGORY[pkg.section];
}

// Nixpkgs' own attribute-path prefix (`SourcedPackage.section` — the
// first segment of the attribute path, e.g. "kdePackages",
// "nltk-data"). Nixpkgs has no per-package category metadata, but its
// scoping convention is itself a taxonomy: language-ecosystem package
// sets end in "Packages" (luajitPackages, llvmPackages_20, ...),
// desktop-environment scopes are named after the DE, and the odd
// data/dictionary scopes carry their own names. Sampled live against
// the real "To Classify" pool (2026-09-03) per scope before trusting:
// - kdePackages -> Settings, same desktop-environment-component
//   reasoning as the kde-* name rules; lomiri/lomiri-qt6 (Ubuntu Touch
//   desktop stack) -> Settings, same DE-family reasoning.
// - nltk-data (NLTK corpora), coqPackages/rocqPackages (theorem-proving
//   libraries), octavePackages (numerical computing) -> Science.
// - Font/artwork scopes (maple-mono, ioskeley-mono, iosevka-comfy,
//   lohit-fonts, openlilylib-fonts, tex-gyre, nixos-artwork) ->
//   Graphics & Design (visual assets).
// - skkDictionaries/dictdDBs (dictionaries) -> Books & Reference, same
//   Dictionary-key reasoning as categories-apps.json.
// - mpvScripts/kodiPackages (media-player plugin ecosystems) ->
//   Photo & Video, same Player-key reasoning.
// - freebsd/netbsd/openbsd/darwin/unixtools (cross-OS userland/base-
//   system compat packages) -> System Tools.
// - nginxModules/apacheHttpdPackages(_2_4) (web-server module/package
//   ecosystems) -> Internet & Communication.
// - home-assistant-* (custom components and Lovelace modules) -> System
//   Tools, same home-automation reasoning as description-category-rules.
// - ankiAddons (Anki flashcard ecosystem) -> Education.
// - eclipses (Eclipse IDE ecosystem) -> Developer Tools.
// - open-music-kontrollers (DSP/audio tooling ecosystem) -> Music &
//   Audio.
// - Every other *Packages/*PackageSets scope (luajitPackages,
//   dotnetCorePackages, rocmPackages, php82Packages, llvmPackages_20,
//   beam27Packages, lixPackageSets, skawarePackages, graalvmPackages,
//   ...) -> Developer Tools — the same language-ecosystem reasoning as
//   Gentoo's dev-* prefix. openraPackages* is deliberately left out
//   (OpenRA game mods are game content, not developer resources), and
//   so are the remaining odd scopes with no coherent category
//   (bat-extras, octodns-providers, arrayUtilities, gawkextlib,
//   magnetophonDSP).
const NIX_SCOPE_TO_APP_CATEGORY: Partial<Record<string, AppCategoryLabel>> = {
  kdePackages: "Settings",
  "nltk-data": "Science",
  coqPackages: "Science",
  rocqPackages: "Science",
  octavePackages: "Science",
  "maple-mono": "Graphics & Design",
  "ioskeley-mono": "Graphics & Design",
  "iosevka-comfy": "Graphics & Design",
  "lohit-fonts": "Graphics & Design",
  "openlilylib-fonts": "Graphics & Design",
  "tex-gyre": "Graphics & Design",
  "nixos-artwork": "Graphics & Design",
  skkDictionaries: "Books & Reference",
  dictdDBs: "Books & Reference",
  mpvScripts: "Photo & Video",
  kodiPackages: "Photo & Video",
  freebsd: "System Tools",
  netbsd: "System Tools",
  openbsd: "System Tools",
  darwin: "System Tools",
  unixtools: "System Tools",
  nginxModules: "Internet & Communication",
  apacheHttpdPackages: "Internet & Communication",
  apacheHttpdPackages_2_4: "Internet & Communication",
  ankiAddons: "Education",
  eclipses: "Developer Tools",
  lomiri: "Settings",
  "lomiri-qt6": "Settings",
  "open-music-kontrollers": "Music & Audio",
  // Small leftover scopes, sampled live (2026-09-03): gawkextlib (GNU awk
  // extension libraries), octodns-providers (DNS-automation provider
  // modules) and the Qt5 package set -> Developer Tools;
  // magnetophonDSP (DSP/audio tooling) -> Music & Audio; bat-extras
  // (bat/cat-clone helper scripts) and arrayUtilities -> Utilities.
  gawkextlib: "Developer Tools",
  "octodns-providers": "Developer Tools",
  libsForQt5: "Developer Tools",
  magnetophonDSP: "Music & Audio",
  "bat-extras": "Utilities",
  arrayUtilities: "Utilities",
};

/** A category inferred from a nixpkgs package's own attribute-path prefix — see `NIX_SCOPE_TO_APP_CATEGORY` above for the live-data research behind each mapping. Exact scopes win over the generic language-package-set rule. */
export function categoryFromNixScope(pkg: SourcedPackage): AppCategoryLabel | undefined {
  if (pkg.source !== "nix-nixpkgs" || !pkg.section) return undefined;
  const exact = NIX_SCOPE_TO_APP_CATEGORY[pkg.section];
  if (exact) return exact;
  if (pkg.section.startsWith("home-assistant-")) return "System Tools";
  if (pkg.section.startsWith("lomiri")) return "Settings";
  // Game-content package sets (OpenRA mods) are game domain, not
  // developer resources — carved out before the generic rule below.
  if (pkg.section.startsWith("openraPackages")) return undefined;
  if (/Packages(Sets)?(_\d+)?$/.test(pkg.section)) return "Developer Tools";
  return undefined;
}
