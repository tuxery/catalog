import type { Risk, SourcedPackage } from "../types";
import type { SnapcraftCacheEntry, SnapcraftChannel } from "./types";

// Snap's risk levels, in Tuxery's vocabulary (docs/product-families.md):
// `edge` is built from the latest commits, Tuxery's `nightly`.
const SNAP_RISKS: Record<string, Risk | undefined> = {
  stable: undefined,
  candidate: "candidate",
  beta: "beta",
  edge: "nightly",
};

/**
 * Splits a Snap channel (`stable`, `beta`, `v11/stable`,
 * `22/stable/hotfix`) into its track and risk. `latest` is Snap's own
 * name for the default track. Pure — no I/O.
 */
export function splitSnapChannel(channel: string): {
  track?: string;
  risk?: Risk;
} {
  const parts = channel.split("/");
  const riskIndex = parts.findIndex((part) => part in SNAP_RISKS);
  const track = riskIndex > 0 ? parts[0] : undefined;
  return {
    ...(track && track !== "latest" ? { track } : {}),
    ...(riskIndex >= 0 && SNAP_RISKS[parts[riskIndex] ?? ""]
      ? { risk: SNAP_RISKS[parts[riskIndex] ?? ""] }
      : {}),
  };
}

/** One package per channel of the snap's channel-map — a track × risk each — or the single search-result channel when the map wasn't fetched. */
export function normalize(entries: SnapcraftCacheEntry[]): SourcedPackage[] {
  return entries.flatMap((entry) =>
    (entry.channels?.length
      ? entry.channels
      : [{ channel: entry.channel, version: entry.version }]
    ).map((channel) => toPackage(entry, channel)),
  );
}

function toPackage(entry: SnapcraftCacheEntry, channel: SnapcraftChannel): SourcedPackage {
  return {
    source: "snap-snapcraft",
    name: entry.title,
    description: entry.summary,
    version: channel.version,
    appId: entry.name,
    ...splitSnapChannel(channel.channel),
    // iconUrl is a full URL, unlike Flathub's bare filename — take just the
    // last path segment for iconFilename so the matcher compares like with
    // like, while still keeping the full URL for iconUrl.
    iconFilename: entry.iconUrl?.split("/").pop(),
    iconUrl: entry.iconUrl,
    homepage: entry.website,
    storeCollections: entry.storeCollections,
    categories: entry.categories,
    hasGameCategory: entry.hasGameCategory,
  };
}
