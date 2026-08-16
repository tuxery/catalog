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

/** Best-effort guess from Debian/Ubuntu's `Section` field, alongside `looksLikeSupportPackage`'s name-based guess — see this file's comment on `NOISE_SECTIONS` for which sections are safe. */
export function looksLikeSupportSection(section: string | undefined): boolean {
  return section !== undefined && NOISE_SECTIONS.has(section);
}
