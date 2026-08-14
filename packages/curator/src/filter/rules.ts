// Cross-distro Linux packaging naming conventions that reliably indicate a
// support package (dev headers, debug symbols, docs, fonts, versioned
// shared libraries) rather than something a user would search an app store
// for. Deliberately conservative, verified against the real cached data
// before picking these specific patterns:
// - A bare `^lib` prefix would have wrongly excluded LibreOffice and
//   LibreCAD (both genuinely start with "lib").
// - A `^rust-`/`^golang-` prefix would have wrongly excluded
//   rust-analyzer, a real standalone tool Debian happens to name that way
//   — real Rust/Go CLI tools (ripgrep, bat, fd-find, hugo) get their own
//   clean name in these distros, only the language's own library/build
//   ecosystem uses the prefix, and there's no clean way to tell those
//   apart by name alone. Left in rather than risk hiding real tools.
const NOISE_PATTERNS: RegExp[] = [
  // Development headers, debug symbols, documentation.
  /-(dev|dbg|dbgsym|docs?)$/,
  // Soname-versioned shared libraries (Debian/Ubuntu convention, e.g.
  // libssl3, libgtk-3-0) — doesn't match libreoffice/librecad since
  // those don't end in a bare digit.
  /^lib[\w.+-]*\d$/,
  // Fonts.
  /^(ttf|fonts|otf)-/,
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
