import type { SourcedPackage } from "../types";
import type { VendorRepoCacheEntry } from "./types";

export function normalize(entries: VendorRepoCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "vendor-repos",
    name: entry.name,
    description: entry.description,
    // Debian's `epoch:` prefix (Spotify's `1:1.2.95...`) is packaging, not part of
    // the version a user knows.
    version: entry.version.replace(/^\d+:/, ""),
    // Unique across vendors: the same deb package name could exist in two
    // vendors' repos.
    appId: `${entry.vendor}/${entry.package}`,
    homepage: entry.homepage,
    // Stable packages only, by construction of the seed list.
    channel: "stable",
  }));
}
