import type { FetchMetadata } from "../_shared/metadata";

/**
 * One hand-vetted vendor package, the shape of a line in `vendors.ndjson`:
 * which package to read out of which vendor-run apt index. Vendor repos
 * have no bounded, crawlable list (see the "vendor-repo connector" card),
 * so the list is curated by hand and each entry checked against the
 * vendor's own install page before it's added.
 */
export interface VendorRepoSeedEntry {
  /** Short id of the vendor, e.g. `google`. Groups apps shipped from one vendor. */
  vendor: string;
  /** Display name, as the vendor writes it (`Google Chrome`), not the deb package name: it's what lets the app match other sources' listing of the same product. */
  name: string;
  /** The stable-channel deb package to read from the index. Never a beta/dev/canary package. */
  package: string;
  /** The vendor's own apt `Packages` file (amd64), plain text. */
  indexUrl: string;
  /** The vendor's own page to install from: the repo has to be added first, so there's no one-line `apt install`. */
  homepage: string;
  /** Fallback for vendors whose index carries no description line (Signal, 1Password, Mullvad VPN). */
  description?: string;
}

/** A seed entry plus what its repo's index says today. */
export interface VendorRepoCacheEntry extends Omit<VendorRepoSeedEntry, "description"> {
  description: string;
  version: string;
}

export type VendorRepoFetchMetadata = FetchMetadata;
