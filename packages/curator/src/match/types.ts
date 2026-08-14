import type { PackageSourceId } from "@tuxery/sources";

/** One side of a manual/deny match entry — identifies a specific package by its source and appId. */
export interface MatchPackageRef {
  source: PackageSourceId;
  appId: string;
}

/**
 * One hand-curated match exception — a pair of packages plus why they
 * were paired. Used both for `overrides/manual-matches.ndjson` (force
 * these two into the same app, no scoring involved) and
 * `overrides/deny-matches.ndjson` (never merge these two, even if the
 * auto rules would). `reason` is required so the exception is auditable
 * later, not just an unexplained pair.
 */
export interface MatchOverrideEntry {
  a: MatchPackageRef;
  b: MatchPackageRef;
  reason: string;
}
