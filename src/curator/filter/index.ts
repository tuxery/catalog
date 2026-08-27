import type { SourcedPackage } from "../../sources";
import type { FilterOverrides } from "./overrides";
import { loadFilterOverrides, overrideKey } from "./overrides";
import {
  looksLikeSourceSpecificNoise,
  looksLikeSupportPackage,
  looksLikeSupportSection,
} from "./rules";

/**
 * Keeps only packages that look like apps/games a user would search an
 * app store for, dropping libraries/dev-headers/docs/fonts. Three tiers,
 * checked in order: `overrides.keep` always wins (forces a package in),
 * `overrides.exclude` always wins next (forces one out), and the auto
 * rules decide everything else — `looksLikeSupportPackage`'s name-based
 * guess, plus `looksLikeSupportSection`'s guess from Debian/Ubuntu's
 * `Section` field where it's present, plus `looksLikeSourceSpecificNoise`
 * for the handful of conventions that only mean "noise" on one specific
 * source. See rules.ts for why all three are deliberately conservative.
 *
 * `overrides` defaults to the real `config/filter-keep.json`/
 * `filter-exclude.json` files (`loadFilterOverrides()`) — the parameter
 * exists so tests can inject a small in-memory set instead of touching
 * those files.
 */
export function filterPackages(
  packages: SourcedPackage[],
  overrides: FilterOverrides = loadFilterOverrides(),
): SourcedPackage[] {
  return packages.filter((pkg) => {
    const key = overrideKey(pkg);
    if (overrides.keep.has(key)) return true;
    if (overrides.exclude.has(key)) return false;
    if (looksLikeSupportSection(pkg.section)) return false;
    if (looksLikeSourceSpecificNoise(pkg.source, pkg.name)) return false;
    return !looksLikeSupportPackage(pkg.name);
  });
}
