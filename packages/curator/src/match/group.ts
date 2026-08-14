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
 *    groups above.
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
  unionByExactKey(uf, packages, (pkg) => normalizeName(pkg.name), overrides.denyPairs);

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
