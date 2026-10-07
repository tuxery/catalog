import { unorderedPairKey } from "helpers4/string";
import { createUnionFind, type UnionFind } from "helpers4/structure";
import type { SourcedPackage } from "../../sources";
import { packageKey } from "./keys";
import { normalizeName } from "./normalize";
import { loadMatchOverrides, type MatchOverrides } from "./overrides";

export interface MatchedApp {
  /** This group's canonical id — see `buildAppId`'s doc comment for how it's picked. */
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

    if (denyPairs.has(unorderedPairKey(pkgKey, representative))) continue;
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
//   itself failing to merge across sources, see `config/match-force.json`):
//   the two projects were merging under this blocked
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
//   `config/match-force.json` entry to reunify with Flathub's
//   "Boxes" once the false merge was cut loose.
// - `singularity` / `ace` / `bass` — found live investigating three
//   miscategorized "To Classify" entries surfaced while adding
//   Gentoo-Section-based category inference (`enrich/category-section.ts`):
//   the real HPC container platform (AUR/Fedora/Nixpkgs' "singularity-ce",
//   "singularity-git") merging with an unrelated real game Debian/Ubuntu/
//   Gentoo package as bare "singularity" (Debian/Ubuntu's own Section for
//   it is literally "games") — the "-git" suffix stripping this file's
//   own AUR/Gentoo variant-suffix handling applies made the collision
//   worse, not better, in this one case, normalizing "singularity-git"
//   straight into the unrelated game's own bare name. "ace" collides
//   Gentoo's own Perl ACE framework (`dev-perl` section) with an unrelated
//   Gentoo "games-board" package of the same short name; "bass" collides
//   an AUR/Arch macro assembler with an unrelated Gentoo "games-rpg"
//   package, also of the same short name.
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
  "singularity",
  "ace",
  "bass",
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
// real bug report that prompted checking this one).
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
//
// Gentoo has its own, independent version of this same "-bin" convention
// (its own ebuilds, not shared with AUR's) — a prebuilt-binary ebuild
// alongside a build-from-source one under the same base name, e.g.
// `www-client/firefox-bin` next to `www-client/firefox` (the real bug
// report that prompted checking this one: `firefox-bin` showing up as
// its own standalone "To Classify" entry instead of merging into the
// main Firefox app). Verified live against the real cache: 122 Gentoo
// package names end in `-bin`, 26 have an exact same-category non-`-bin`
// twin to merge with (the rest are standalone binary-only packages with
// no source-built twin, correctly left alone); the `-git`/`-cvs`/`-beta`
// conventions exist too, just far rarer (7/2/3 packages). Same regexes,
// same reasoning, just a second source added to the check below.
const CHANNEL_WORD_SUFFIX =
  /-(beta|nightly|alpha|canary|unstable|preview)(?:-(?:git|svn|hg|bzr|cvs|bin))?$/;
const VARIANT_SUFFIX = /-(git|svn|hg|bzr|cvs|bin)$/;
const SOURCES_WITH_VARIANT_SUFFIXES = new Set(["pacman-aur", "ebuild-gentoo"]);

// Two more single-source conventions of the same "alternate build of the
// same software" shape, checked against the real caches (2026-10-07): AUR's
// `-appimage` (a package that installs the project's upstream AppImage
// instead of building it: 427 names, 223 with an exact same-name twin once
// stripped, e.g. `goldendict-ng-appimage` / `goldendict-ng`), and nixpkgs'
// `-unwrapped` (the raw package a wrapper derivation is built from: 61 names,
// 57 with a twin, e.g. `firefoxpwa-unwrapped` / `firefoxpwa`).
const AUR_APPIMAGE_SUFFIX = /-appimage$/;
const NIX_UNWRAPPED_SUFFIX = /-unwrapped$/;

/**
 * Strips AUR/Gentoo's own build-variant/channel-word suffix convention
 * (`-git`/`-bin`/`-beta-bin`/...) from a package's name, when that
 * source uses the convention at all — see `tier2Key`'s doc comment for
 * the full reasoning. Exported (not just inlined into `tier2Key`) so
 * anything comparing names *within* an already-formed group (e.g.
 * `enrich/data-confidence.ts`'s name-agreement signal) uses the exact
 * same equivalence the matcher itself used to justify grouping them —
 * without it, `jan`/`jan-bin`/`jan-git` (a real, correctly-merged case)
 * would read as a name conflict, which it isn't.
 */
export function stripVariantSuffix(pkg: Pick<SourcedPackage, "source" | "name">): string {
  if (pkg.source === "nix-nixpkgs") return pkg.name.replace(NIX_UNWRAPPED_SUFFIX, "");
  if (!SOURCES_WITH_VARIANT_SUFFIXES.has(pkg.source)) return pkg.name;
  const name = pkg.source === "pacman-aur" ? pkg.name.replace(AUR_APPIMAGE_SUFFIX, "") : pkg.name;
  return name.replace(CHANNEL_WORD_SUFFIX, "").replace(VARIANT_SUFFIX, "");
}

/**
 * Tier 2's key function — `normalizeName`, except:
 * - `GENERIC_NAME_BLOCKLIST` entries return `undefined` (skipped by
 *   `unionByExactKey`, same as a package with no name at all) so they
 *   never union on name alone.
 * - AUR/Gentoo packages ending in a channel word (`CHANNEL_WORD_SUFFIX`,
 *   optionally with a build-variant suffix after it) or a bare
 *   build-variant suffix (`VARIANT_SUFFIX`) are keyed on their
 *   suffix-stripped name instead (`stripVariantSuffix`), so e.g.
 *   `0xtools-git`, `zen-browser-bin`, `firefox-bin`, or
 *   `brave-origin-beta-bin` unions with
 *   `0xtools`/`zen-browser`/`firefox`/`brave-origin` (that source's own
 *   bare package, or any other source's) rather than staying a permanent
 *   duplicate.
 */
// AUR names a patched or re-packaged build as "<project>-<what's different>"
// (`pidgin-gnutls`, `firefox-vaapi`, `rssguard-nowebengine-git`), usually
// keeping the project's own description, sometimes with a parenthesised
// note appended. Name prefix alone is far too loose (`firefox-sync` is a
// tmpfs script, not Firefox), so a package unions with the project named
// by one of its hyphen-prefixes only when the two descriptions also agree:
// identical, or one is the start of the other (both at least 25 chars, so
// "A tool" can't qualify). Measured on the real caches (2026-10-07): 610
// single-package AUR entries match on identical descriptions, 1,059 more
// on the prefix form; hand-checked samples of both were almost all true
// variants (`bleachbit-cli`, `android-studio-system`, `firefox-pure`,
// `firefox-vaapi`).
const MIN_DESCRIPTION_LENGTH = 25;
const MIN_BASE_NAME_LENGTH = 3;

function normalizeDescription(text: string | undefined): string {
  return (text ?? "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function descriptionsAgree(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= MIN_DESCRIPTION_LENGTH && long.startsWith(short);
}

/** Tier 2c: AUR variants of a project, matched by name prefix + description. */
function unionDescribedVariants(
  uf: UnionFind<string>,
  packages: SourcedPackage[],
  denyPairs: Set<string>,
): void {
  const byName = new Map<string, SourcedPackage[]>();
  for (const pkg of packages) {
    const name = normalizeName(stripVariantSuffix(pkg));
    if (GENERIC_NAME_BLOCKLIST.has(name)) continue;
    const list = byName.get(name) ?? [];
    list.push(pkg);
    byName.set(name, list);
  }

  for (const pkg of packages) {
    // `gog-<title>` wrappers have their own tier, and sequels often reuse the
    // prequel's blurb (`gog-deponia-2-...` is not a variant of `gog-deponia`).
    if (pkg.source !== "pacman-aur" || pkg.name.startsWith("gog-")) continue;
    const description = normalizeDescription(pkg.description);
    if (description.length < MIN_DESCRIPTION_LENGTH) continue;

    const parts = stripVariantSuffix(pkg).toLowerCase().split("-");
    const pkgKey = packageKey(pkg);
    search: for (let cut = parts.length - 1; cut >= 1; cut -= 1) {
      const base = normalizeName(parts.slice(0, cut).join("-"));
      if (base.length < MIN_BASE_NAME_LENGTH) break;
      for (const candidate of byName.get(base) ?? []) {
        if (candidate === pkg) continue;
        if (!descriptionsAgree(description, normalizeDescription(candidate.description))) continue;
        const candidateKey = packageKey(candidate);
        if (denyPairs.has(unorderedPairKey(pkgKey, candidateKey))) continue;
        uf.union(pkgKey, candidateKey);
        break search;
      }
    }
  }
}

/**
 * Tier 2b: AUR's `gog-<title>` wrappers (community packages around a GOG.com
 * installer, ~150 of them) against the `gog` source's own listing of the
 * same title. Scoped to exactly those two sources: a blanket "strip a
 * vendor prefix" rule would be far too broad, but a `gog-` AUR package that
 * normalizes onto a GOG.com title is that game by construction, and no other
 * source is keyed here, so nothing else can collide with it.
 */
function gogWrapperKey(pkg: SourcedPackage): string | undefined {
  if (pkg.source === "gog") return normalizeName(pkg.name);
  if (pkg.source === "pacman-aur" && pkg.name.startsWith("gog-")) {
    return normalizeName(stripVariantSuffix({ ...pkg, name: pkg.name.slice("gog-".length) }));
  }
  return undefined;
}

function tier2Key(pkg: SourcedPackage): string | undefined {
  const normalized = normalizeName(stripVariantSuffix(pkg));
  return GENERIC_NAME_BLOCKLIST.has(normalized) ? undefined : normalized;
}

/**
 * Picks a group's canonical id from its member packages — prefers
 * whichever naming convention is already globally unique on its own,
 * so most apps don't need an invented `source:` prefix at all:
 *
 * 1. Snap — Snapcraft enforces store-wide unique names at publish time
 *    (verified live against the full 202,983-app catalog: 0
 *    collisions across every snap-snapcraft package, and 0 collisions
 *    against every Flatpak id too). Preferred first over Flatpak
 *    despite Flatpak's reverse-DNS id being the more "correct" Linux-
 *    desktop convention (D-Bus/AppStream/GSettings all use it) — the
 *    515 apps carrying both are disproportionately the best-known,
 *    most-shared ones (an app on both major stores is usually a
 *    mature, popular one), so this is exactly where a short id
 *    (`firefox`) over a dotted one (`org.mozilla.firefox`) matters
 *    most for UX, sharing, and SEO (shorter URLs, no special
 *    characters to percent-encode in search-result snippets).
 * 2. Flatpak — reverse-DNS appId, unique by domain-ownership
 *    convention (verified live: 0 collisions). `flatpak-flathub`
 *    preferred over `flatpak-appcenter` when a group somehow carries
 *    both with *different* appIds (verified live: 35 real cases, e.g.
 *    a renamed or independently-submitted app) — same ranking
 *    `SOURCE_PRIORITY` (enrich/index.ts) already gives flathub over
 *    appcenter for display data, kept consistent here even though the
 *    id and the display-data representative are picked independently
 *    and can differ.
 * 3. Everything else — `source:appId` (or `source:name` with no
 *    appId), the only tier that isn't globally unique on its own, so
 *    it needs the source prefix. Any `/` already in the appId itself
 *    (GitHub Releases/AppImage's `owner/repo`, Gentoo's
 *    `category/name`) is normalized to `:` too, rather than mixing
 *    two separator characters in one id — verified live that `:`
 *    never occurs naturally in any real appId/name anywhere in the
 *    catalog, so it's safe to reuse as the one and only separator.
 *
 * `members` is in the same order `groupPackages` encountered them, so
 * the tier-3 fallback keeps the previous "first package that formed
 * the group" behavior — the only difference from before is that it's
 * now explicitly the *last* resort instead of always winning.
 */
function buildAppId(members: SourcedPackage[]): string {
  const snap = members.find((pkg) => pkg.source === "snap-snapcraft" && (pkg.appId ?? pkg.name));
  if (snap) return (snap.appId ?? snap.name) as string;

  const flathub = members.find((pkg) => pkg.source === "flatpak-flathub" && pkg.appId);
  if (flathub) return flathub.appId as string;

  const appcenter = members.find((pkg) => pkg.source === "flatpak-appcenter" && pkg.appId);
  if (appcenter) return appcenter.appId as string;

  const [first] = members;
  if (!first) throw new Error("buildAppId: a group had no member packages");
  const idPart = (first.appId ?? first.name).replaceAll("/", ":");
  return `${first.source}:${idPart}`;
}

/**
 * Groups packages from possibly different sources into unified apps.
 * Three tiers, cheapest first:
 *
 * 0. Manual overrides (`config/match-force.json`) — forced,
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
  const uf = createUnionFind<string>();
  for (const pkg of packages) uf.find(packageKey(pkg));

  // Tier 0: manual overrides.
  for (const entry of overrides.force) {
    const destinationKey = `${entry.destination.source}:${entry.destination.appId}`;
    for (const ref of entry.sources) {
      uf.union(destinationKey, `${ref.source}:${ref.appId}`);
    }
  }

  // Tier 1: exact appId match.
  unionByExactKey(uf, packages, tier1Key, overrides.denyPairs);

  // Tier 2: exact normalized-name match.
  unionByExactKey(uf, packages, tier2Key, overrides.denyPairs);

  // Tier 2b: AUR's gog-* wrappers onto the matching GOG.com listing.
  unionByExactKey(uf, packages, gogWrapperKey, overrides.denyPairs);

  // Tier 2c: AUR variants (`<project>-<difference>`) of a project whose description they share.
  unionDescribedVariants(uf, packages, overrides.denyPairs);

  // Collect final groups — id is picked from every member at once (see
  // `buildAppId`), not just the first package seen for each root, since
  // the choice depends on which sources the *whole* group carries.
  const membersByRoot = new Map<string, SourcedPackage[]>();

  for (const pkg of packages) {
    const root = uf.find(packageKey(pkg));
    const members = membersByRoot.get(root) ?? [];
    members.push(pkg);
    membersByRoot.set(root, members);
  }

  return [...membersByRoot.values()].map((members) => ({
    id: buildAppId(members),
    packages: members,
  }));
}
