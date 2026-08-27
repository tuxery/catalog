import type { SourcedPackage } from "../../sources";
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

// Tiers 1 and 2 (below) both union purely on one exact string (appId or
// normalized name respectively), with nothing else to disambiguate —
// safe for most names, but a short list of generic, desktop-environment-
// style app names turn out to be reused by multiple genuinely different,
// unrelated projects:
// - `calculator` — GNOME Calculator, KDE Kalk, ExpidusOS Calculator, and
//   elementary's own Calculator: four separate projects sharing one
//   display name.
// - `weather` — GNOME Weather and KDE KWeather (separate projects) plus
//   an unrelated AUR command-line weather-lookup utility.
// - `calendar` — GNOME Calendar, elementary's own Calendar, the classic
//   Unix `calendar` CLI utility, a Vim plugin, an XEmacs mode, and an
//   OCaml library — six unrelated things.
// - `contacts` / `camera` / `music` / `maps` — each pairs GNOME's own app
//   with elementary's separate, independently-built app of the same name
//   (not a rebrand — genuinely different codebases); `maps` also pulls
//   in an unrelated academic "MaRDI4NFDI/maps" research-data package.
// - `notes` — nuttyartist/notes vs. GNOME's own Notes (upstream name
//   Bijiben) — different projects sharing a generic display name.
// - `photos` — KDE's koko image gallery, elementary's own separate
//   Photos app, and an unrelated AUR "photos" package (a C++ interface
//   to PHOTOS, a particle-physics simulation library — nothing to do
//   with a photo gallery).
// - `portfolio` — a file manager (Portfolio) vs. Portfolio Performance
//   (an investment-tracking app) — unrelated software, not even the same
//   category of app.
// - `fuse` — the FUSE filesystem interface/reference implementation, the
//   Fuse ZX Spectrum emulator, and a Perl "Fuse" module — three unrelated
//   projects.
// - `clock` / `mail` — KDE kclock plus an unrelated AUR clock utility and
//   a Haskell time library; elementary's own Mail plus a Ruby email
//   library — same "generic name, multiple real but unrelated matches"
//   pattern (Gentoo's `acct-group`/`acct-user` system accounts also
//   surfaced here, now separately excluded via `filter/rules.ts`'s
//   `GENTOO_NOISE_CATEGORIES` before matching ever sees them).
//
// Blocked from both tiers: bare-appId sources (AUR/Fedora/Debian/...
// literally use the package name as appId), so the same collision is
// reachable there too, not just through normalized names.
//
// `terminal` was checked and NOT excluded: its only multi-source cluster
// (void + gentoo, both "Terminal"/"terminal") is the exact same GNUstep
// terminal-emulator project referenced from two sources — a correct
// merge, not a bug.
//
// - `zen` — Flathub's Zen Browser (`app.zen_browser.zen`) vs. an
//   unrelated AUR "zen" ("Reduce your stress with the C language...") —
//   found live investigating a user-reported false negative (Zen Browser
//   itself failing to merge across sources, see `config/overrides/manual-
//   matches.ndjson`): the two projects were merging under this blocked
//   generic word, then the browser's own AUR packages (`zen-browser`,
//   `zen-browser-bin`, ...) were staying separate from it — a false
//   merge and a false split at the same time, from two different bugs.
// - `boxes` — Flathub's GNOME Boxes (`org.gnome.Boxes.desktop`, display
//   name "Boxes") vs. a real, unrelated ASCII-art text tool of the exact
//   same short name (boxes.thomasjensen.com, "textmode box- and comment
//   drawing filter") — verified live: every one of AUR/Fedora/Nixpkgs/
//   Gentoo/Debian/Ubuntu's own "boxes" package is that ASCII tool, none
//   of them GNOME Boxes (which every native distro instead packages as
//   "gnome-boxes", a different normalized name that never collided in
//   the first place). Found live investigating the compat-warnings
//   feature. Same as `zen`, this was a false merge and a false split at
//   once — GNOME Boxes' own Snap/native packages, all named
//   "gnome-boxes", were never part of this cluster and needed their own
//   `config/overrides/manual-matches.ndjson` entry to reunify with Flathub's
//   "Boxes" once the false merge was cut loose.
const GENERIC_NAME_BLOCKLIST = new Set([
  "calculator",
  "weather",
  "calendar",
  "contacts",
  "camera",
  "music",
  "maps",
  "notes",
  "photos",
  "portfolio",
  "fuse",
  "clock",
  "mail",
  "zen",
  "boxes",
]);

/**
 * Tier 1's key function — `pkg.appId`, except for `GENERIC_NAME_BLOCKLIST`
 * entries (checked via `normalizeName`, since the bare-package-name
 * sources that hit this tier — AUR, Arch, Fedora, Debian/Ubuntu family,
 * Snapcraft, Alpine, Void, Slackware, Solus, openSUSE, Gentoo, nixpkgs —
 * use the literal, unnormalized package name as `appId`) — same
 * protection Tier 2 already had: `unionByExactKey` on raw `appId` alone
 * had no defense against two of those sources packaging genuinely
 * unrelated software under one of these exact generic words, the same
 * class of collision the blocklist's own comment documents.
 */
function tier1Key(pkg: SourcedPackage): string | undefined {
  if (!pkg.appId) return undefined;
  return GENERIC_NAME_BLOCKLIST.has(normalizeName(pkg.appId)) ? undefined : pkg.appId;
}

// AUR's own submission guidelines reserve these suffixes for an alternate
// build of the exact same software as the unsuffixed package — not a
// different project, unlike every other name collision this file guards
// against. Two conventions, same effect: `-git`/`-svn`/`-hg`/`-bzr`/`-cvs`
// mark a rolling-release snapshot build (verified live: 8,312 AUR
// name-pairs share a base name this way, e.g. `0xtools`/`0xtools-git`);
// `-bin` marks a prebuilt-binary build instead of building from source
// (verified live: 4,392 pairs, e.g. `zen-browser`/`zen-browser-bin` — the
// real bug report that prompted checking this one). AUR-only: no
// equivalent convention verified elsewhere yet.
//
// A release-channel word (`-beta`/`-nightly`/`-alpha`/`-canary`/
// `-unstable`/`-preview`, optionally followed by one of the build-variant
// suffixes above, e.g. `-beta-bin`) is the same "alternate build of the
// same software" shape, just a different axis — verified live: 232 real
// AUR name-pairs share a base this way (e.g. `brave-origin-bin`/
// `brave-origin-beta-bin`/`brave-origin-nightly-bin`, the real bug report
// that prompted checking this one — beta/nightly weren't unioning with
// the stable build at all, staying permanent standalone duplicates while
// `-bin` alone already worked). Deliberately excludes `-dev`, despite
// reading like a channel word too — collides with Debian-style `-dev`
// headers packages, a real, different, well-established meaning.
const AUR_CHANNEL_WORD =
  /-(beta|nightly|alpha|canary|unstable|preview)(?:-(?:git|svn|hg|bzr|cvs|bin))?$/;
const AUR_VARIANT_SUFFIX = /-(git|svn|hg|bzr|cvs|bin)$/;

/**
 * Tier 2's key function — `normalizeName`, except:
 * - `GENERIC_NAME_BLOCKLIST` entries return `undefined` (skipped by
 *   `unionByExactKey`, same as a package with no name at all) so they
 *   never union on name alone.
 * - AUR packages ending in a channel word (`AUR_CHANNEL_WORD`, optionally
 *   with a build-variant suffix after it) or a bare build-variant suffix
 *   (`AUR_VARIANT_SUFFIX`) are keyed on their suffix-stripped name
 *   instead, so e.g. `0xtools-git`, `zen-browser-bin`, or
 *   `brave-origin-beta-bin` unions with `0xtools`/`zen-browser`/
 *   `brave-origin` (AUR's own bare package, or any other source's)
 *   rather than staying a permanent duplicate.
 */
function tier2Key(pkg: SourcedPackage): string | undefined {
  const name =
    pkg.source === "pacman-aur"
      ? pkg.name.replace(AUR_CHANNEL_WORD, "").replace(AUR_VARIANT_SUFFIX, "")
      : pkg.name;
  const normalized = normalizeName(name);
  return GENERIC_NAME_BLOCKLIST.has(normalized) ? undefined : normalized;
}

/**
 * Groups packages from possibly different sources into unified apps.
 * Three tiers, cheapest first:
 *
 * 0. Manual overrides (`config/overrides/manual-matches.ndjson`) — forced,
 *    ignoring deny (explicit human intent beats everything).
 * 1. Exact `appId` match — e.g. Snapcraft/Debian/AUR/Arch/Fedora all use
 *    the bare package name as appId, so "firefox" unions across all of
 *    them for free. Skips `GENERIC_NAME_BLOCKLIST` entries (via
 *    `tier1Key`) — see its comment for why bare-appId sources need the
 *    same protection Tier 2 has.
 * 2. Exact normalized-name match — bridges sources with human-readable
 *    names (Flathub's "Firefox", AppImage's "GIMP") to the appId-based
 *    groups above. Skips `GENERIC_NAME_BLOCKLIST` entries — see its
 *    comment for the real cross-source false-merges that motivated it.
 *    Also folds AUR's `-git`/`-svn`/`-hg`/`-bzr`/`-cvs`/`-bin` build-variant
 *    packaging convention into the same key as its unsuffixed twin — see
 *    `tier2Key`'s comment.
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
  unionByExactKey(uf, packages, tier1Key, overrides.denyPairs);

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
