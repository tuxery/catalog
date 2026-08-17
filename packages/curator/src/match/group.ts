import type { SourcedPackage } from "@tuxery/sources";
import { packageKey, pairKey } from "./keys";
import { normalizeName } from "./normalize";
import { loadMatchOverrides, type MatchOverrides } from "./overrides";
import { UnionFind } from "./union-find";

export interface MatchedApp {
  /** Stable id for this group, derived from the first package (in input order) that formed it. */
  id: string;
  packages: SourcedPackage[];
}

/**
 * Unions every package sharing the same `keyFn(pkg)` value to the first
 * one seen with that value — O(n), not O(n²): every tier below is an
 * exact-match lookup, no pairwise scoring anywhere. Skips (leaves
 * ungrouped by this tier) any pair whose union-find keys are
 * deny-listed; doesn't catch every transitive case (if A and B are
 * both, separately, unioned to C, a deny entry between A and B
 * specifically won't undo that indirect connection) — deny entries are
 * meant for clear, direct false positives, not as a general constraint
 * solver.
 */
function unionByExactKey(
  uf: UnionFind<string>,
  packages: SourcedPackage[],
  keyFn: (pkg: SourcedPackage) => string | undefined,
  denyPairs: Set<string>,
): void {
  const representativeForValue = new Map<string, string>();

  for (const pkg of packages) {
    const value = keyFn(pkg);
    if (!value) continue;

    const pkgKey = packageKey(pkg);
    const representative = representativeForValue.get(value);

    if (!representative) {
      representativeForValue.set(value, pkgKey);
      continue;
    }

    if (denyPairs.has(pairKey(pkgKey, representative))) continue;
    uf.union(pkgKey, representative);
  }
}

// Tier 2 (below) unions purely on normalized name, with no appId to
// disambiguate — safe for most names, but a short list of generic,
// desktop-environment-style app names turn out to be reused by multiple
// genuinely different, unrelated projects. Verified against the real
// dataset (each one traced back to its actual constituent packages, not
// assumed from the name alone) before excluding it from tier 2 — found
// via a real cross-source-merge quality pass, not preemptively:
// - `calculator` — GNOME Calculator, KDE Kalk, ExpidusOS Calculator, and
//   elementary's own Calculator are four separate projects that all
//   happen to display as "Calculator".
// - `weather` — GNOME Weather and KDE KWeather (separate projects) plus
//   an unrelated AUR command-line weather-lookup utility.
// - `calendar` — GNOME Calendar, elementary's own separate Calendar, the
//   classic Unix `calendar` CLI utility, a Vim calendar plugin, an
//   XEmacs calendar mode, and an OCaml calendar library — six unrelated
//   things merged into one group before this fix.
// - `contacts` / `camera` / `music` / `maps` — each pairs GNOME's own
//   app with elementary's separate, independently-built app of the same
//   name (not a rebrand — genuinely different codebases); `maps` also
//   pulled in an unrelated academic "MaRDI4NFDI/maps" research-data
//   package.
// - `notes` — nuttyartist/notes vs. GNOME's own Notes (upstream name
//   Bijiben) — different projects sharing a generic display name.
// - `portfolio` — a file manager (Portfolio) vs. Portfolio Performance
//   (an investment-tracking app) — unrelated software, not even the
//   same category of app.
// - `fuse` — the FUSE filesystem interface/reference implementation,
//   the Fuse ZX Spectrum emulator, and a Perl "Fuse" module — three
//   unrelated projects.
// - `clock` / `mail` — KDE kclock plus an unrelated AUR clock utility
//   and a Haskell time library; elementary's own Mail plus a Ruby email
//   library — same "generic name, multiple real but unrelated matches"
//   pattern (Gentoo's `acct-group`/`acct-user` system accounts also
//   surfaced here, now separately excluded via
//   `filter/rules.ts`'s `GENTOO_NOISE_CATEGORIES` before matching ever
//   sees them).
//
// `terminal` was checked and NOT excluded: its only multi-source cluster
// (void + gentoo, both "Terminal"/"terminal") turned out to be the exact
// same GNUstep terminal-emulator project referenced from two sources —
// a correct merge, not a bug.
const GENERIC_NAME_BLOCKLIST = new Set([
  "calculator",
  "weather",
  "calendar",
  "contacts",
  "camera",
  "music",
  "maps",
  "notes",
  "portfolio",
  "fuse",
  "clock",
  "mail",
]);

/**
 * Tier 2's key function — `normalizeName`, except for `GENERIC_NAME_BLOCKLIST`
 * entries, which return `undefined` (skipped by `unionByExactKey`, same as
 * a package with no name at all) so they never union on name alone.
 */
function tier2Key(pkg: SourcedPackage): string | undefined {
  const normalized = normalizeName(pkg.name);
  return GENERIC_NAME_BLOCKLIST.has(normalized) ? undefined : normalized;
}

/**
 * Groups packages from possibly different sources into unified apps.
 * Three tiers, cheapest first:
 *
 * 0. Manual overrides (`overrides/manual-matches.ndjson`) — forced,
 *    ignoring deny (explicit human intent beats everything).
 * 1. Exact `appId` match — e.g. Snapcraft/Debian/AUR/Arch/Fedora all use
 *    the bare package name as appId, so "firefox" unions across all of
 *    them for free.
 * 2. Exact normalized-name match — bridges sources with human-readable
 *    names (Flathub's "Firefox", AppImage's "GIMP") to the appId-based
 *    groups above. Skips `GENERIC_NAME_BLOCKLIST` entries — see its
 *    comment for the real cross-source false-merges that motivated it.
 *
 * No fuzzy/scored tier: with `score.ts`'s current weights (name 0.5,
 * appId 0.35, icon 0.15) and a 0.75 threshold, any pair reaching
 * threshold necessarily has an exact appId or exact name match — the
 * best a pair WITHOUT either can score is 0.5 (near-1 name similarity)
 * + 0.15 (icon match) = 0.65, always under threshold. So a scored tier
 * on top of tiers 1-2 could never fire a match tiers 1-2 didn't already
 * find — this was just as true of the single-tier scan this replaced,
 * it only became obvious once the tiers were split apart. `scoreMatch`
 * stays exported from this package for when weights/threshold get
 * revisited (tracked on the Tuxery GitHub Project), just not wired in
 * here until then.
 */
export function groupPackages(
  packages: SourcedPackage[],
  overrides: MatchOverrides = loadMatchOverrides(),
): MatchedApp[] {
  const uf = new UnionFind<string>();
  for (const pkg of packages) uf.find(packageKey(pkg));

  // Tier 0: manual overrides.
  for (const entry of overrides.manual) {
    uf.union(`${entry.a.source}:${entry.a.appId}`, `${entry.b.source}:${entry.b.appId}`);
  }

  // Tier 1: exact appId match.
  unionByExactKey(uf, packages, (pkg) => pkg.appId, overrides.denyPairs);

  // Tier 2: exact normalized-name match.
  unionByExactKey(uf, packages, tier2Key, overrides.denyPairs);

  // Collect final groups — id comes from the first package (input order)
  // seen for each root, same "first package that formed it" semantics as
  // before the tiered rewrite.
  const idByRoot = new Map<string, string>();
  const membersByRoot = new Map<string, SourcedPackage[]>();

  for (const pkg of packages) {
    const root = uf.find(packageKey(pkg));

    if (!idByRoot.has(root)) idByRoot.set(root, `${pkg.source}:${pkg.appId ?? pkg.name}`);

    const members = membersByRoot.get(root) ?? [];
    members.push(pkg);
    membersByRoot.set(root, members);
  }

  return [...membersByRoot.entries()].map(([root, members]) => ({
    id: idByRoot.get(root) as string,
    packages: members,
  }));
}
