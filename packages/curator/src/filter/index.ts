import type { SourcedPackage } from "@tuxery/sources";
import type { FilterOverrides } from "./overrides";
import { loadFilterOverrides, overrideKey } from "./overrides";
import { looksLikeSupportPackage } from "./rules";

/**
 * Keeps only packages that look like apps/games a user would search an
 * app store for, dropping libraries/dev-headers/docs/fonts. Three tiers,
 * checked in order: `overrides.keep` always wins (forces a package in),
 * `overrides.exclude` always wins next (forces one out), and
 * `looksLikeSupportPackage`'s auto rules decide everything else. See
 * rules.ts for why those rules are deliberately conservative.
 *
 * `overrides` defaults to the real `overrides/*.ndjson` files
 * (`loadFilterOverrides()`) — the parameter exists so tests can inject a
 * small in-memory set instead of touching those files.
 */
export function filterPackages(
  packages: SourcedPackage[],
  overrides: FilterOverrides = loadFilterOverrides(),
): SourcedPackage[] {
  return packages.filter((pkg) => {
    const key = overrideKey(pkg);
    if (overrides.keep.has(key)) return true;
    if (overrides.exclude.has(key)) return false;
    return !looksLikeSupportPackage(pkg.name);
  });
}
