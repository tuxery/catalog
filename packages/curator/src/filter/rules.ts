import type { PackageSourceId } from "@tuxery/sources";

// Cross-distro Linux packaging naming conventions that reliably indicate a
// support package (dev headers, debug symbols, docs, fonts, libraries,
// language-ecosystem modules) rather than something a user would search an
// app store for. Deliberately conservative:
// - `^lib` is a blanket noise prefix (see below) rather than a narrower
//   soname-versioned-only check — real exceptions (LibreOffice, LibreCAD,
//   ...) are rescued via `overrides/keep.ndjson` instead of trying to keep
//   excluding them by pattern, since prefix matching can't reliably tell
//   libreoffice/librecad apart from the many other `libre*` names that are
//   coincidentally "lib" + a word starting with "re" (libreadline,
//   librealsense, librecast, ...) — only an exact-name allowlist can.
// - A `^rust-`/`^golang-` prefix would have wrongly excluded
//   rust-analyzer, a real standalone tool Debian happens to name that way
//   — real Rust/Go CLI tools (ripgrep, bat, fd-find, hugo) get their own
//   clean name in these distros, only the language's own library/build
//   ecosystem uses the prefix, and there's no clean way to tell those
//   apart by name alone. Left in rather than risk hiding real tools. Older
//   "library-culture" ecosystems below (Perl, OCaml, Haskell, Lua, R, Tcl)
//   don't have this problem — their prefixed packages are overwhelmingly
//   modules/libraries, not user-facing tools, unlike Rust/Go's real
//   CLI-tool culture.
const NOISE_PATTERNS: RegExp[] = [
  // Development headers, debug symbols, documentation (Debian/Ubuntu-style
  // suffixes) and their Fedora-style equivalents (-devel, -debuginfo,
  // -debugsource use a full word rather than an abbreviation).
  /-(dev|dbg|dbgsym|docs?|devel|debuginfo|debugsource)$/,
  // Any `lib`-prefixed package — see this file's header comment on why a
  // narrower pattern (only soname-versioned names like libssl3) doesn't
  // scale; real exceptions are allowlisted by exact name in
  // overrides/keep.ndjson instead.
  /^lib/,
  // Fedora's `-libs` suffix convention (e.g. zlib-libs) — doesn't start
  // with "lib" itself, so needs its own pattern even with the blanket
  // `^lib` prefix above.
  /-libs$/,
  // Static-library variant packages.
  /-static$/,
  // Fonts.
  /^(ttf|fonts|otf)-/,
  // Perl/OCaml/Haskell/Lua/R/Tcl module packages — Fedora-style prefix
  // naming (perl-DBI, ocaml-astring, ghc-Cabal, lua-cqueues, R-DBI,
  // tcl-snack). The Debian-style equivalent (libwww-perl, libxml-simple-
  // perl, ...) is already caught by the blanket `^lib` prefix above, since
  // that convention always starts with "lib".
  /^(perl|ocaml|ghc|lua[\d.]*|R|tcl)-/,
  // Desktop-shell extensions/widgets (GNOME Shell, KWin, Plasma, COSMIC) —
  // need their shell/compositor as a host to do anything, same "not
  // launchable on its own" reasoning as a library. Decided 2026-08-20:
  // exclude for now rather than build a dedicated "Extensions" section:
  // - `gnome-shell-extension-` — real and large (verified live: 422 AUR,
  //   1,378 Nixpkgs, 48 Fedora, 41 Debian, among others). Two real
  //   standalone tools happen to share the prefix despite not being
  //   extensions themselves — `gnome-shell-extension-manager` (a GTK app)
  //   and `-installer` (a bash script) — rescued via `overrides/keep.ndjson`.
  // - `kwin-effect(s)-`/`kwin-style-`/`kwin-decoration-` — KWin visual
  //   effects/window themes (kwin-effects-burn-my-windows,
  //   kwin-style-breeze, kwin-decoration-oxygen, ...). Deliberately doesn't
  //   match bare `kwin`/`kwin-x11`/`kwin-wayland`/`kwin-common`/etc. — the
  //   compositor itself, a different (if also not very "launchable")
  //   category not in scope here.
  // - `plasma[0-9]*-applets?-` / `-plasma-applet` / `-plasmoid[-git]` —
  //   Plasma widgets, whose naming shows up as both a prefix
  //   (plasma6-applets-kara) and a suffix (kalgebra-plasmoid,
  //   kclock-plasma-applet) depending on packager.
  // - `cosmic-ext-applet-` only, not the broader `cosmic-ext-` prefix —
  //   verified live that `cosmic-ext-` also covers real standalone
  //   third-party COSMIC-ecosystem apps (cosmic-ext-calculator,
  //   cosmic-ext-tweaks, cosmic-ext-control-center, ...), not just panel
  //   applets — a blanket `cosmic-ext-` prefix would have wrongly excluded
  //   those.
  /^gnome-shell-extension-/,
  /^kwin-(effects?|style|decoration)-/,
  /^plasma\d*-applets?-|-plasma-applet$|-plasmoid(-git)?$/,
  /^cosmic-ext-applet-/,
  // DKMS kernel modules/drivers (nvidia-580xx-dkms, acpi-call-dkms,
  // bbswitch-dkms, nvidia-dkms-535-open, nvidia-340xx-dkms-macbook, ...)
  // — need `insmod`/the kernel itself as a host, never launched on their
  // own, same reasoning as a library. Verified live: 484+ in AUR alone
  // plus Ubuntu's own nvidia-dkms-<version>[-open|-server] driver
  // packages, no exceptions found — every sample was a driver, whether
  // "dkms" lands as a clean suffix or has a version/variant tag after it.
  /-dkms(-|$)/,
  // "SDK"-named packages — verified live: overwhelmingly per-service API
  // client libraries (aws-sdk-cpp-<service>: 400+ packages across
  // sources, one per AWS service; aliyun-python-sdk: 490 in Nixpkgs
  // alone; azure-sdk, py3-sentry-sdk/slack-sdk/splunk-sdk, ...) or build
  // kits (plasma-sdk, libreoffice-sdk, the KDE/Qt Snapcraft "content
  // snap" SDKs) — never launched, same shape as the library patterns
  // above. Real exceptions exist and are rescued via
  // overrides/keep.ndjson: dotnet-sdk (a real CLI toolchain — `dotnet
  // build`/`dotnet run` — across its several per-distro naming schemes),
  // wasi-sdk (a clang-based toolchain), google-cloud-sdk (the `gcloud`
  // CLI), and bare android-sdk (`sdkmanager`) — but NOT its per-component
  // sub-packages (android-sdk-build-tools-*, -platform-tools, -cmake-*),
  // which are libraries, not the tool itself.
  /(^|-)sdk(-|$)/,
];

/**
 * Best-effort guess that `name` is a library/dev/doc/font support package
 * rather than an app or game a user would search for — not a classifier,
 * just the auto-rule tier of filtering. See `overrides/keep.ndjson` and
 * `overrides/exclude.ndjson` for the escape hatches on either side.
 */
export function looksLikeSupportPackage(name: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(name));
}

// Debian's own packaging convention: a `-source` suffix ships the actual
// source code (kernel-module sources for module-assistant/DKMS, compiler
// sources, library source archives) — never a launchable app. Verified
// live: 58 real matches on Debian alone, only one exception found
// (`apt-show-source`, a real CLI tool that shows info *about* source
// packages, not itself one — rescued via `overrides/keep.ndjson`).
// Deliberately Debian-family only (Ubuntu/Mint/Pop!_OS/Deepin/MX Linux
// share the identical deb822 packaging convention, same as this file's
// other Debian-Section notes) — checked AUR/Nixpkgs/openSUSE/Fedora too
// and the same suffix means something else entirely there: real OBS
// Studio plugins (`obs-gradient-source`, a video *input* source, not
// shipped source code), a real build-variant of a real app
// (`teamtalk-client-source`, "built from upstream source" — the same
// "alternate build channel" shape as AUR's own -git/-bin conventions,
// not noise), and more, so a source-agnostic pattern would have been
// wrong.
const DEBIAN_FAMILY_SOURCES = new Set<PackageSourceId>([
  "deb-debian",
  "deb-ubuntu",
  "deb-mint",
  "deb-popos",
  "deb-deepin",
  "deb-mxlinux",
]);

// Snapcraft/Ubuntu Core's own term of art: a "gadget snap" defines a
// board/device's boot configuration (bootloader, device tree, partition
// layout) — infrastructure, never launched. Verified live: all 6 real
// Snapcraft matches are board-support packages. Snapcraft-only: checked
// AUR/Nixpkgs too and "gadget" means something unrelated there
// (`kubectl-gadget`, a real Kubernetes troubleshooting CLI tool) — a
// source-agnostic pattern would have excluded a real tool.
const GADGET_SUFFIX = /-gadget$/;

// AUR-specific cross-compilation convention: `android-<arch>-<name>`
// packages are libraries built *for* Android as a compile target
// (audio/video codecs, C++ utility libraries, UI component sets), not
// apps — verified live, every one of a 30-entry sample across several
// arches was a library, none launchable. Deliberately narrower than a
// blanket `android-` prefix, which was checked and rejected: real
// standalone tools share it too (`android-apktool`, `android-emulator`,
// `android-file-transfer`, ...). AUR-only: verified zero matches on any
// other source.
const ANDROID_CROSS_COMPILE_LIB = /^android-(aarch64|armv7a|riscv64|x86-64|x86)-/;

/**
 * Source-specific noise conventions `looksLikeSupportPackage` can't catch
 * on name alone, since the same shape means something different on other
 * sources (Debian's `-source` vs. AUR/Nixpkgs' real "input source"
 * plugins; Snapcraft's `-gadget` vs. Nixpkgs' real `kubectl-gadget` tool).
 * See each pattern's own comment above for the verification behind it.
 */
export function looksLikeSourceSpecificNoise(source: PackageSourceId, name: string): boolean {
  if (DEBIAN_FAMILY_SOURCES.has(source) && name.endsWith("-source")) return true;
  if (source === "snap-snapcraft" && GADGET_SUFFIX.test(name)) return true;
  if (source === "pacman-aur" && ANDROID_CROSS_COMPILE_LIB.test(name)) return true;
  return false;
}

// Debian/Ubuntu's `Section` field (SourcedPackage.section — Fedora's RPM
// Group field is unused upstream in practice, "Unspecified" on real data;
// Arch's desc format has no equivalent at all) — an official, upstream
// classification the name-pattern rules above have no visibility into.
//
// Included — unambiguously support packages, no real exceptions found:
// - libs / libdevel / oldlibs — shared libraries, headers, transitional
//   compat packages.
// - doc — documentation, manuals, guides (including plain-text books
//   packaged as Debian docs, e.g. "anarchism" — not apps either).
// - debug — every entry is a "-dbg"/"debugging symbols for X" package.
// - introspection — GObject typelib data (gir1.2-*).
// - gnu-r — almost entirely r-cran-*/r-bioc-*/r-other-* library packages;
//   the few real exceptions (r-base itself, littler, ...) are allowlisted
//   by exact name instead of loosening this rule — see
//   overrides/keep.ndjson.
//
// Deliberately NOT included, despite being tempting (same "library
// ecosystem" framing as the patterns above) — real standalone tools mix
// in at a rate too high to blanket-exclude: python (black, bpython,
// cookiecutter, azure-cli, alembic, ...), perl (alice, biber, cme,
// cpan-listchanges, ...), golang (assetfinder, aws-nuke, cliphist,
// cobra-cli, cosign, ...), ruby (asciidoctor, batalert, ...), php
// (composer, cmsscanner, ...), java (activemq, ...), javascript, haskell
// (ghc, glirc, ...), ocaml, lisp (abcl, ...), devel (a56, abi-dumper,
// acme, ...), kernel (dt-utils, firmware/driver packages a user may
// genuinely want), interpreters (brandy, bwbasic, ...). Same reasoning as
// this file's rust-/golang- name-prefix exception above — these sections
// mix a language's own library ecosystem with genuine standalone tools
// written in it, and Section alone can't tell them apart.
const NOISE_SECTIONS = new Set([
  "libs",
  "libdevel",
  "oldlibs",
  "doc",
  "debug",
  "introspection",
  "gnu-r",
]);

// Nixpkgs reuses the same `section` slot for its attribute-path namespace
// prefix (e.g. `kdePackages.akregator` -> `kdePackages`), a differently-
// shaped value than Debian's fixed vocabulary — version-numbered variants
// are common (python313Packages, lua54Packages, rubyPackages_3_3,
// chickenPackages_5, ...), so a plain Set can't match them; patterns can.
// kdePackages was checked and *rejected* despite being tempting (same
// "distro packaging namespace" framing as Debian's Section) — it mixes
// real standalone apps (akregator, ark, arianna) with libraries
// (akonadi-contacts, accounts-qt) at too high a rate.
// "*Packages" is NOT a safe general suffix: kdePackages mixes real apps
// with libraries as above, and php83Packages/phpPackages contain real
// standalone tools (composer, psalm, phpmd, php-cs-fixer) right next to
// phpXXExtensions' pure PECL extensions. Every entry below is
// individually verified, not inferred from the suffix alone.
const NIX_NOISE_PREFIX_PATTERNS: RegExp[] = [
  // Language/ecosystem package sets, overwhelmingly modules not standalone
  // tools: R (CRAN mirror), Haskell (Hackage mirror), Python (PyPI
  // mirror, any interpreter version), Perl (CPAN mirror), OCaml (opam
  // mirror), Common Lisp (SBCL/Chicken/Akku package sets), Lua, Ruby (any
  // version), TeX Live (LaTeX packages), Typst (template/library
  // packages) — none of these are apps.
  /^rPackages$/,
  /^haskellPackages$/,
  /^py(thon|py)\d*Packages$/,
  /^perl5?Packages$/,
  /^ocamlPackages(_\w+)?$/,
  /^sbclPackages$/,
  /^chickenPackages(_\d+)?$/,
  /^akkuPackages$/,
  /^lua\d*Packages$/,
  /^rubyPackages(_\d+_\d+)?$/,
  /^texlivePackages$/,
  /^typstPackages$/,
  // Toolchain/library component sets verified individually (unlike the
  // "*Packages" suffix in general, see this const's header comment):
  // Qt6 bindings (unlike kdePackages, no real apps mixed in), Wine build
  // components, Godot export templates, and PostgreSQL extensions (any
  // major-version-numbered variant).
  /^qt6Packages$/,
  /^wine(64|WoW64)?Packages$/,
  /^godotPackages(_[\w.]+)?$/,
  /^postgresql\d*Packages$/,
  // Plugins/extensions for a host app the user needs already installed —
  // not independently launchable, same "would a user launch this on its
  // own" litmus test as overrides/README.md's keep.ndjson guidance
  // (mirrors the libretro-core/browser-extension exclusions decided
  // there for AppImageHub-derived names). Verified as a safe general
  // pattern across many different host-app namespaces (fish, tmux, vim,
  // obs-studio, netbox, roundcube, gimp, elasticsearch, grafana, ...).
  /plugins?$/i,
  /extensions?$/i,
  // Not applications at all, by construction: editor package sets
  // (emacs' own package ecosystem, itself plugin-shaped even without
  // matching the pattern above), syntax-highlighting grammars, kernel
  // builds/modules (any variant — xanmod/zen/latest/...), Android SDK/
  // build-environment components, dictionaries, and Terraform provider
  // plugins.
  /^emacsPackages$/,
  /^tree-sitter-grammars$/,
  /^linux(Kernel|Packages(_[\w.]+)?)$/,
  /^androidenv$/,
  /^(hyphen|hunspell)Dicts$/,
  /^terraform-providers$/,
];

// openSUSE reuses the same `section` slot for its hierarchical RPM
// `<rpm:group>` value (e.g. `System/Libraries`, `Documentation/HTML`) — see
// SourcedPackage.section. Hit the exact same trap Debian's "devel"/
// "kernel"/language sections and Nixpkgs' `kdePackages` did —
// `Development/Libraries/*` and `Development/Languages/*` were checked and
// *rejected* despite the tempting "just libraries" framing: real
// standalone tools turned up in every one sampled (clisp, love, act,
// typescript, codespell, dialog, ...), same "language ecosystem mixes in
// real tools" reasoning as Debian's python/perl/golang sections.
//
// Included — unambiguously support packages, with one exception across
// all six groups (Metapackages' "seidl", a real standalone monitoring
// client mixed in among patterns-*/installation-images-*/skelcd-*
// install-time metapackages — allowlisted by exact name in
// overrides/keep.ndjson rather than loosening this rule, same as Debian's
// gnu-r r-base/littler):
// - System/Libraries — shared libraries and runtime plugins.
// - Documentation/HTML / Documentation/Other — javadoc, manuals, API docs.
// - System/X11/Fonts — font packages.
// - System/Localization — `-lang`/translation packages.
// - Metapackages — `patterns-*` desktop/server install selections,
//   `installation-images-*`, `skelcd-*` — install-time bundles, not apps.
const OPENSUSE_NOISE_GROUPS = new Set([
  "System/Libraries",
  "Documentation/HTML",
  "Documentation/Other",
  "System/X11/Fonts",
  "System/Localization",
  "Metapackages",
]);

// Slackware reuses the same `section` slot for its package "series" — a
// short component code from PACKAGE LOCATION (e.g. `l`, `kde`, `xfce`,
// `y`). Far coarser than Debian's Section vocabulary (15 series total).
// Every series other than the two below mixes real standalone apps with
// libraries at a rate too high to blanket-exclude — same trap as
// everywhere else this file documents it, just under Slackware's own
// naming: `d` (development — bison, python-pip, cargo-c mixed with pure
// dev libraries), `a` (base — xz, efibootmgr, usbutils are real CLI
// tools), `n` (network — alpine, dhcpcd, gnupg, httpd, ethtool are real
// tools), `x`/`xap`/`xfce`/`kde` (desktop-environment series mixing real
// GUI apps with their own libraries, e.g. kompare/kontact/plasma-workspace
// vs. kmime/kpeoplevcard). `y` (games), `t`/`tcl` (TeX/Tcl), and `e`
// (only emacs, emacspeak, both real apps) were also checked and kept.
//
// Included — safe after sampling:
// - `l` (libraries) — one real exception found (`glade`, a real
//   standalone GUI UI designer despite the "l" series) — allowlisted by
//   exact name in overrides/keep.ndjson rather than loosening this rule,
//   same as Debian's gnu-r r-base/littler and openSUSE's
//   Metapackages/seidl.
// - `f` (FAQs/docs — only linux-faqs, linux-howtos, both pure
//   documentation).
const SLACKWARE_NOISE_SERIES = new Set(["l", "f"]);

// Solus reuses the same `section` slot for its `PartOf` value — a dotted
// hierarchical grouping (e.g. `games.strategy`, `programming.library`).
// Hit the same language/toolchain-ecosystem trap as everywhere else —
// `programming.*` buckets other than the two below (`.devel`, `.python`,
// `.perl`, `.tools`, and bare `programming`) mix real tools in, and even
// `programming.devel` (almost entirely already `-devel`-suffixed and so
// already caught by name pattern regardless) has a small tail of real
// tools among the un-suffixed remainder (gcc-13, dpkg, mingw-w64,
// rocm-info) — not worth the risk for zero marginal catch. `system.base`
// was checked too: real CLI tools (zstd, gzip) sit right next to pure
// libraries (glibc, libdw, mpfr), same trap.
//
// Included — safe after sampling, one real exception found overall:
// - `debug` — every sampled entry is a `-dbginfo` package.
// - `programming.library` / `desktop.library` / `multimedia.library` —
//   library packages. `desktop.library` had one real exception —
//   `dcraw`, a standalone command-line raw photo converter despite the
//   "library" grouping — allowlisted by exact name rather than loosening
//   this rule, same pattern as Slackware's `glade`.
// - `programming.docs` — documentation packages.
// - `desktop.theme` — icon/GTK/Qt themes, not launchable apps.
// - `emul32` — 32-bit compat libraries (`-32bit`-suffixed).
const SOLUS_NOISE_PARTOF = new Set([
  "debug",
  "programming.library",
  "programming.docs",
  "desktop.library",
  "multimedia.library",
  "desktop.theme",
  "emul32",
]);

// Gentoo reuses the same `section` slot for its top-level category (e.g.
// `games-strategy`, `dev-libs`) — same trap as everywhere else for most
// categories (dev-*/app-* mix real tools with libraries), but two are
// unambiguous no matter how sampled: `acct-group`/`acct-user` (every one
// a "System group: X"/"A group for Y" system-account definition — not
// software at all, discovered because they were surviving the filter and
// polluting cross-source name matches, e.g. "acct-group/clock" merging
// into the real "Clock" app group) and `virtual` (every one a "Virtual
// for X" dependency-resolution abstraction Portage uses to pick between
// providers, e.g. `virtual/jre`, `virtual/editor` — never a real
// launchable package itself).
const GENTOO_NOISE_CATEGORIES = new Set(["acct-group", "acct-user", "virtual"]);

/** Best-effort guess from Debian/Ubuntu's `Section` field, nixpkgs' attribute-path prefix, openSUSE's `<rpm:group>` value, Slackware's package series, Solus's `PartOf` value, or Gentoo's category, alongside `looksLikeSupportPackage`'s name-based guess — see this file's comments on `NOISE_SECTIONS`/`NIX_NOISE_PREFIX_PATTERNS`/`OPENSUSE_NOISE_GROUPS`/`SLACKWARE_NOISE_SERIES`/`SOLUS_NOISE_PARTOF`/`GENTOO_NOISE_CATEGORIES` for which values are safe. */
export function looksLikeSupportSection(section: string | undefined): boolean {
  if (section === undefined) return false;
  return (
    NOISE_SECTIONS.has(section) ||
    NIX_NOISE_PREFIX_PATTERNS.some((p) => p.test(section)) ||
    OPENSUSE_NOISE_GROUPS.has(section) ||
    SLACKWARE_NOISE_SERIES.has(section) ||
    GENTOO_NOISE_CATEGORIES.has(section) ||
    SOLUS_NOISE_PARTOF.has(section)
  );
}

// Debian/Ubuntu Section values that predict a real, launchable GUI app —
// the weaker half of the "GUI vs CLI classification" card, alongside
// `SourcedPackage.hasDesktopFile` (Fedora/openSUSE's direct signal). No
// equivalent synthetic desktop-file marker exists in Debian's Packages.gz,
// so this leans on Section instead — verified by cross-tabulating every
// real Debian/Ubuntu Section value against apps *already* known to be GUI
// via the Fedora/openSUSE signal.
//
// Included — well above baseline *and* manually sampled clean — every
// "not flagged gui" entry checked in these sections is either a real CLI
// tool (ani-cli, aravis-tools-cli, ax25-apps) or a companion data/plugin/
// server package for an app already captured elsewhere (see
// GUI_SECTION_EXCLUDE_PATTERNS below), never a mislabeled real app:
// sound, editors, video, graphics, math, science, hamradio, games,
// contrib/games.
//
// Deliberately NOT included despite comparably high raw rates — manual
// sampling turned up real desktop-environment theme/icon/plugin packages
// riding along in these sections that this heuristic can't tell apart
// from real apps by Section alone (adwaita-icon-theme, adwaita-qt6,
// breeze-icon-theme, breeze-cursor-theme, arc-kde, Numix Circle Icons,
// thunar-font-manager, xfce4-battery-plugin, ...) — same "look at real
// samples, not just the percentage" trap NOISE_SECTIONS' header comment
// describes for kdePackages/Development/*: x11, gnome, kde, xfce.
const GUI_SECTIONS = new Set([
  "sound",
  "editors",
  "video",
  "graphics",
  "math",
  "science",
  "hamradio",
  "games",
  "contrib/games",
]);

// Companion data/plugin/server packages that ride along under the same
// GUI_SECTIONS value as the real app they belong to (0ad-data next to 0ad,
// ardour-lv2-plugins next to ardour, bzflag-server next to bzflag) but
// aren't themselves a launchable GUI app — none of these suffixes are
// caught by `looksLikeSupportPackage`'s NOISE_PATTERNS, which is scoped to
// dev/debug/doc/lib/font/language-module naming, not this.
const GUI_SECTION_EXCLUDE_PATTERNS: RegExp[] = [
  /-data$/,
  /-common$/,
  /-plugins?$/,
  /-server$/,
  /-icons?$/,
];

/**
 * Best-effort guess that a Debian/Ubuntu package (`SourcedPackage.section`)
 * is a real, launchable GUI app — the weaker counterpart to
 * `SourcedPackage.hasDesktopFile`. Callers should only apply this to
 * `source: "deb-debian" | "deb-ubuntu"` packages: other sources reuse the same
 * `section` slot for unrelated vocabularies (see this file's other
 * per-distro Section comments) that were never checked against
 * GUI_SECTIONS.
 */
export function looksLikeGuiPackage(name: string, section: string | undefined): boolean {
  if (section === undefined || !GUI_SECTIONS.has(section)) return false;
  if (looksLikeSupportPackage(name)) return false;
  return !GUI_SECTION_EXCLUDE_PATTERNS.some((pattern) => pattern.test(name));
}

// Debian's own top-level `games` Section, plus its component-prefixed
// variants — `contrib/games`/`non-free/games`. Debian's own normalize.ts
// passes `section` straight through (unlike Ubuntu's, which strips the
// `<component>/` prefix down to the bare value — see deb-ubuntu's
// `normalizeSection`), so Debian's real `SourcedPackage.section` keeps
// the prefixed form while Ubuntu's is always bare "games" by the time it
// gets here; `universe/games`/`multiverse/games` are listed anyway as a
// harmless safety net in case that ever changes. Mint/Pop!_OS/Deepin/MX
// Linux reuse Debian's unstripped pass-through, not Ubuntu's — same
// reasoning as `looksLikeSupportSection`'s NOISE_SECTIONS. Real Debian
// and Ubuntu `games`-section entries checked are always real games or a
// real game's own companion data/server package (0ad-data,
// sauerbraten-server, ...) — never something unrelated.
const DEB_FAMILY_GAME_SECTIONS = new Set([
  "games",
  "contrib/games",
  "non-free/games",
  "universe/games",
  "multiverse/games",
]);
const DEB_FAMILY_GAME_SOURCES = new Set<PackageSourceId>([
  "deb-debian",
  "deb-ubuntu",
  "deb-mint",
  "deb-popos",
  "deb-deepin",
  "deb-mxlinux",
]);

/**
 * Best-effort guess that a package (`SourcedPackage.section`) is a game,
 * across every source whose Section-equivalent field has its own games
 * grouping — the counterpart to `SourcedPackage.hasGameCategory` (Flathub/
 * AppCenter's direct AppStream signal). Each source's own vocabulary,
 * checked against real data before trusting it, same discipline as
 * `looksLikeGuiPackage`/`looksLikeSupportSection`:
 * - Debian family (see `DEB_FAMILY_GAME_SECTIONS`/`_SOURCES`).
 * - Gentoo's `games-*` category prefix (e.g. `games-strategy`,
 *   `games-fps`) — Gentoo's own top-level category effectively *is* its
 *   app classification, unlike Debian's Section; real entries checked are
 *   all games or a game's own data/server sub-package.
 * - openSUSE's `Amusements/Games` `<rpm:group>` prefix — all games, plus
 *   a couple of gaming-adjacent tools openSUSE itself groups here (e.g.
 *   `PlayOnLinux`, close enough to not chase further). RPM Fusion reuses
 *   the identical `Amusements/Games` prefix and convention — real games on
 *   real data too (gltron, stepmania, doom-shareware, ...).
 * - Solus's `games.*`/`games` `PartOf` value — all games or
 *   gaming-adjacent tools Solus itself groups here (e.g. `antimicrox`,
 *   a joystick-to-keyboard mapper).
 * Not (yet) checked: Slackware's `y` series has too few real entries —
 * too small a sample to trust either way, left out for now.
 */
export function looksLikeGamePackage(
  source: PackageSourceId,
  section: string | undefined,
): boolean {
  if (section === undefined) return false;
  if (DEB_FAMILY_GAME_SOURCES.has(source)) return DEB_FAMILY_GAME_SECTIONS.has(section);
  if (source === "ebuild-gentoo") return section.startsWith("games-");
  if (source === "rpm-opensuse" || source === "rpm-rpmfusion") {
    return section.startsWith("Amusements/Games");
  }
  if (source === "eopkg-solus") return section === "games" || section.startsWith("games.");
  return false;
}
