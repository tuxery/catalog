import type { PackageSourceId } from "../../sources";

/** One side of a manual/deny match entry — identifies a specific package by its source and appId. */
export interface MatchPackageRef {
  source: PackageSourceId;
  appId: string;
}

/**
 * One hand-curated deny exception — a pair of packages that must never
 * merge even if the auto tiers would (`config/match-deny.json`).
 * Deliberately pairwise, not destination+sources like `ForceMatchEntry`
 * below: there's no canonical side to a "keep these apart" rule.
 * `reason` is required so the exception is auditable later, not just an
 * unexplained pair.
 */
export interface MatchOverrideEntry {
  a: MatchPackageRef;
  b: MatchPackageRef;
  reason: string;
}

/**
 * One hand-curated force-merge exception (`config/match-force.json`) —
 * every package in `sources` merges into `destination`, no scoring
 * involved. `reason` is required so the exception is auditable later,
 * not just an unexplained group.
 */
export interface ForceMatchEntry {
  destination: MatchPackageRef;
  sources: MatchPackageRef[];
  reason: string;
}
