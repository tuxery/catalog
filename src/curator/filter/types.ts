import type { PackageSourceId } from "../../sources";

/**
 * One hand-curated exception to `looksLikeSupportPackage`'s auto rules —
 * either forcing a package to stay in the catalog despite matching a
 * noise pattern (`config/filter-keep.json`), or forcing one out despite
 * not matching any (`config/filter-exclude.json`). `sources` lists every
 * source this exact `name` has actually been checked on, not a wildcard
 * across all of them. `reason` is required so the exception is auditable
 * later, not just an unexplained entry.
 */
export interface FilterOverrideEntry {
  sources: PackageSourceId[];
  name: string;
  reason: string;
}
