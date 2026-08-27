import type { PackageSourceId } from "../../sources";

/**
 * One hand-curated exception to `looksLikeSupportPackage`'s auto rules —
 * either forcing a package to stay in the catalog despite matching a
 * noise pattern (`config/overrides/keep.ndjson`), or forcing one out despite not
 * matching any (`config/overrides/exclude.ndjson`). `reason` is required so the
 * exception is auditable later, not just an unexplained entry.
 */
export interface FilterOverrideEntry {
  source: PackageSourceId;
  name: string;
  reason: string;
}
