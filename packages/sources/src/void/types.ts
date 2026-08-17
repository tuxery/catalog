import type { FetchMetadata } from "../_shared/metadata";

/**
 * One package's parsed plist dict from Void's `index.plist` repodata —
 * keyed by pkgname upstream, this is the value shape, close to the
 * upstream fields rather than the normalized `SourcedPackage` — see
 * `normalize.ts`.
 */
export interface VoidCacheEntry {
  name: string;
  short_desc: string;
  /** `<pkgname>-<version>_<revision>`, e.g. `0ad-0.27.1_6` — see `normalize.ts`'s version extraction. */
  pkgver: string;
  homepage?: string;
  /** Which repo this package belongs to — "main" (the default repo), "nonfree" (proprietary/restricted, same organizing principle as Debian's non-free), or "multilib" (32-bit compat packages for 64-bit systems, `-32bit`-suffixed names). */
  repo: "main" | "nonfree" | "multilib";
}

export interface VoidFetchMetadata extends FetchMetadata {
  reposFetched: string[];
}
