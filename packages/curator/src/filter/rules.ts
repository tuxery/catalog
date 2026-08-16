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
