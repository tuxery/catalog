import type { FetchMetadata } from "../_shared/metadata";

/**
 * One `<package>` entry from openSUSE Tumbleweed's `primary.xml`
 * repodata — the same RPM repodata schema Fedora uses (`../fedora/`
 * parses the identical XML shape) — the shape cached after parsing.
 * Deliberately close to the upstream fields rather than the normalized
 * `SourcedPackage` — see `normalize.ts`.
 */
export interface OpenSuseCacheEntry {
  name: string;
  summary: string;
  version: string;
  homepage?: string;
  /** Which repo this package belongs to — "oss" or "non-oss" (proprietary/restricted, same organizing principle as Debian's non-free). */
  repo: "oss" | "non-oss";
  /** RPM `<rpm:group>` value, e.g. "Development/Libraries/C and C++" — see SourcedPackage.section. Absent or "Unspecified" on real data for roughly a third of packages. */
  group?: string;
}

export interface OpenSuseFetchMetadata extends FetchMetadata {
  reposFetched: string[];
}
