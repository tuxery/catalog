// Cross-distro Linux packaging naming conventions that reliably indicate a
// support package (dev headers, debug symbols, docs, fonts, libraries,
// language-ecosystem modules) rather than something a user would search an
// app store for. Deliberately conservative, verified against the real
// cached data before picking these specific patterns:
// - `^lib` is a blanket noise prefix (see below) rather than the narrower
//   soname-versioned-only check this used to be — the real exceptions
//   (LibreOffice, LibreCAD, ...) are rescued via `overrides/keep.ndjson`
//   instead of trying to keep excluding them by pattern. See that pattern's
//   own comment for why: extending the regex doesn't scale past a certain
//   point (56k+ real libraries starting with `lib` were slipping through
//   the old digit-suffix-only check), and prefix matching can't reliably
//   tell libreoffice/librecad apart from the 1,200+ other `libre*` names
//   that are coincidentally "lib" + a word starting with "re" (libreadline,
//   librealsense, librecast, ...) — only an exact-name allowlist can.
// - A `^rust-`/`^golang-` prefix would have wrongly excluded
//   rust-analyzer, a real standalone tool Debian happens to name that way
//   — real Rust/Go CLI tools (ripgrep, bat, fd-find, hugo) get their own
//   clean name in these distros, only the language's own library/build
//   ecosystem uses the prefix, and there's no clean way to tell those
//   apart by name alone. Left in rather than risk hiding real tools. Older
//   "library-culture" ecosystems below (Perl, OCaml, Haskell, Lua, R, Tcl)
//   don't have this problem — verified against real cached data that their
//   prefixed packages are overwhelmingly modules/libraries, not user-facing
//   tools, unlike Rust/Go's real CLI-tool culture.
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

// Debian/Ubuntu's `Section` field (SourcedPackage.section — Fedora's RPM
// Group field is unused upstream in practice, "Unspecified" on real data;
// Arch's desc format has no equivalent at all) — an official, upstream
// classification the name-pattern rules above have no visibility into.
// Verified against the real Debian cache before picking this specific
// set: for each candidate section, checked whether real standalone tools
// show up in it, not just libraries/modules.
//
// Included — every sample checked was unambiguously a support package,
// no exceptions found even in expanded (60-130 entry) samples:
// - libs / libdevel / oldlibs — shared libraries, headers, transitional
//   compat packages.
// - doc — documentation, manuals, guides (including plain-text books
//   packaged as Debian docs, e.g. "anarchism" — not apps either).
// - debug — every entry is a "-dbg"/"debugging symbols for X" package.
// - introspection — GObject typelib data (gir1.2-*).
// - gnu-r — 1,313 of 1,320 checked are r-cran-*/r-bioc-*/r-other-*
//   library packages; the 7 exceptions (r-base itself, littler, ...) are
//   real but few enough to allowlist by exact name instead of loosening
//   this rule — see overrides/keep.ndjson.
//
// Deliberately NOT included, despite being tempting (same "library
// ecosystem" framing as the patterns above) — checked and found real
// standalone tools mixed in at a rate too high to blanket-exclude:
// python (black, bpython, cookiecutter, azure-cli, alembic, ...), perl
// (alice, biber, cme, cpan-listchanges, ...), golang (assetfinder,
// aws-nuke, cliphist, cobra-cli, cosign, ...), ruby (asciidoctor,
// batalert, ...), php (composer, cmsscanner, ...), java (activemq, ...),
// javascript, haskell (ghc, glirc, ...), ocaml, lisp (abcl, ...), devel
// (a56, abi-dumper, acme, ...), kernel (dt-utils, firmware/driver
// packages a user may genuinely want), interpreters (brandy, bwbasic,
// ...). Same reasoning as this file's existing rust-/golang- name-prefix
// exception — these sections mix a language's own library ecosystem
// with genuine standalone tools written in it, and Section alone can't
// tell them apart.
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
// Same verification discipline as NOISE_SECTIONS above — checked real
// samples per prefix before including one, including the exact trap that
// caught Debian's "devel"/"kernel" sections: kdePackages was checked and
// *rejected* despite being tempting (same "distro packaging namespace"
// framing) — it mixes real standalone apps (akregator, ark, arianna) with
// libraries (akonadi-contacts, accounts-qt) at too high a rate, same
// reasoning as Debian's "devel" section.
// "*Packages" is NOT a safe general suffix — checked and rejected as one:
// kdePackages mixes real apps (akregator, ark, arianna) with libraries,
// and php83Packages/phpPackages contain real standalone tools (composer,
// psalm, phpmd, php-cs-fixer) alongside phpXXExtensions being pure PECL
// extensions right next to it. Every entry below is individually
// verified, not inferred from the suffix alone.
const NIX_NOISE_PREFIX_PATTERNS: RegExp[] = [
  // Language/ecosystem package sets verified as overwhelmingly modules,
  // not standalone tools (sampled 4-6 entries per prefix, all libraries,
  // for every prefix below): R (CRAN mirror), Haskell (Hackage mirror),
  // Python (PyPI mirror, any interpreter version), Perl (CPAN mirror),
  // OCaml (opam mirror), Common Lisp (SBCL/Chicken/Akku package sets),
  // Lua, Ruby (any version), TeX Live (LaTeX packages), Typst (template/
  // library packages) — none of these are apps.
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
  // there for AppImageHub-derived names). Verified as a safe *general*
  // pattern across ~10 different host-app namespaces (fish, tmux, vim,
  // obs-studio, netbox, roundcube, gimp, elasticsearch, grafana, ...) —
  // every single one sampled was a plugin, none a standalone app.
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
// SourcedPackage.section. Same verification discipline as NOISE_SECTIONS/
// NIX_NOISE_PREFIX_PATTERNS above: sampled 15-60 real entries per group
// before including it, and hit the exact same trap Debian's "devel"/
// "kernel"/language sections and Nixpkgs' `kdePackages` did —
// `Development/Libraries/*` and `Development/Languages/*` were checked and
// *rejected* despite the tempting "just libraries" framing: real
// standalone tools turned up in every one sampled (clisp, love, act,
// typescript, codespell, dialog, ...), same "language ecosystem mixes in
// real tools" reasoning as Debian's python/perl/golang sections.
//
// Included — every sample checked (15-60 entries per group) was
// unambiguously a support package, with one single exception across all
// six groups (Metapackages' "seidl", a real standalone monitoring client
// mixed in among 193 patterns-*/installation-images-*/skelcd-* install-time
// metapackages — allowlisted by exact name in overrides/keep.ndjson rather
// than loosening this rule, same as Debian's gnu-r r-base/littler):
// - System/Libraries — shared libraries and runtime plugins (60 sampled,
//   zero exceptions).
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
// `y`). Far coarser than Debian's Section vocabulary (15 series total
// across the whole ~1,900-package tree) — same verification discipline:
// sampled entries per series before including one. Every series other
// than the two below mixes real standalone apps with libraries at a rate
// too high to blanket-exclude — same trap as everywhere else this file
// documents it, just under Slackware's own naming: `d` (development —
// bison, python-pip, cargo-c mixed with pure dev libraries), `a` (base —
// xz, efibootmgr, usbutils are real CLI tools), `n` (network — alpine,
//   dhcpcd, gnupg, httpd, ethtool are real tools), `x`/`xap`/`xfce`/`kde`
// (desktop-environment series mixing real GUI apps with their own
// libraries, e.g. kompare/kontact/plasma-workspace vs. kmime/
// kpeoplevcard). `y` (games), `t`/`tcl` (TeX/Tcl), and `e` (only 2
// entries: emacs, emacspeak, both real apps) were also checked and kept.
//
// Included — safe after sampling:
// - `l` (libraries, 501 packages) — 60 sampled, one real exception found
//   (`glade`, a real standalone GUI UI designer despite the "l" series)
//   — allowlisted by exact name in overrides/keep.ndjson rather than
//   loosening this rule, same as Debian's gnu-r r-base/littler and
//   openSUSE's Metapackages/seidl.
// - `f` (FAQs/docs — only 2 packages: linux-faqs, linux-howtos, both
//   pure documentation).
const SLACKWARE_NOISE_SERIES = new Set(["l", "f"]);

// Solus reuses the same `section` slot for its `PartOf` value — a dotted
// hierarchical grouping (e.g. `games.strategy`, `programming.library`),
// 115 distinct values on real data. Same verification discipline:
// sampled entries per value before including one, and hit the same
// language/toolchain-ecosystem trap as everywhere else — `programming.*`
// buckets other than the two below (`.devel`, `.python`, `.perl`,
// `.tools`, and bare `programming`) mix real tools in, and even
// `programming.devel` (2,070 packages, 98.6% already `-devel`-suffixed
// and so already caught by name pattern regardless) has a small tail of
// real tools among the un-suffixed 1.4% (gcc-13, dpkg, mingw-w64,
// rocm-info) — not worth the risk for zero marginal catch.
// `system.base` was checked too: real CLI tools (zstd, gzip) sit right
// next to pure libraries (glibc, libdw, mpfr), same trap.
//
// Included — safe after sampling (30-40 entries per value, one real
// exception found overall):
// - `debug` (3,743 packages) — every sampled entry is a `-dbginfo`
//   package.
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
// unambiguous no matter how sampled: `acct-group`/`acct-user` (900
// packages, every one a "System group: X"/"A group for Y" system-account
// definition — not software at all, discovered because they were
// surviving the filter and polluting cross-source name matches, e.g.
// "acct-group/clock" merging into the real "Clock" app group) and
// `virtual` (134 packages, every one a "Virtual for X" dependency-
// resolution abstraction Portage uses to pick between providers, e.g.
// `virtual/jre`, `virtual/editor` — never a real launchable package
// itself).
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
