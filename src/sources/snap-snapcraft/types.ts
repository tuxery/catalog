import type { FetchMetadata } from "../_shared/metadata";
import type { ProjectLinks, StoreCollectionTag } from "../types";

/**
 * One snap from `api.snapcraft.io/api/v1/snaps/search` and `/v2/snaps/info`, the
 * shape cached after fetching. Deliberately close to the upstream API fields rather than the
 * normalized `SourcedPackage` — see `normalize.ts`.
 */
export interface SnapcraftChannel {
  /** Full channel name as the store prints it: `stable`, `v11/beta`, `22/stable/hotfix`. A bare risk is the `latest` track. */
  channel: string;
  version: string;
  /** When this revision was released to the channel (ISO), the channel-map's `released-at` — `SourcedPackage.builtAt`. */
  releasedAt?: string;
}

export interface SnapcraftCacheEntry {
  /** Snap name, e.g. "spotify" — also its store identifier. */
  name: string;
  title: string;
  summary: string;
  version: string;
  /** Release channel/track, e.g. "stable", "edge". */
  channel: string;
  /** Every amd64 channel of the snap's channel-map (`/v2/snaps/info`), absent when the snap has no amd64 build or that call failed — `normalize` then falls back to `channel`/`version`. */
  channels?: SnapcraftChannel[];
  iconUrl?: string;
  website?: string;
  /** The listing's Markdown description, as the publisher wrote it. */
  longDescription?: string;
  /** Free-text SPDX-ish expression the publisher declared (`GPL-2.0+`), `Other` or `Proprietary` when they didn't pick one. */
  license?: string;
  /** The publishing account's display name — not necessarily the app's developer. */
  publisher?: string;
  /** Whether Canonical verified the publisher's identity (`validation: "verified"`). */
  publisherVerified?: boolean;
  /** Full URLs of the listing's `screenshot` media, in the publisher's order. Banners are left out. */
  screenshots?: string[];
  /** The listing's links, already mapped from Snap's `issues`/`source`/`donations`/`contact`/`documentation` to project link types. */
  links?: ProjectLinks;
  /** See `SourcedPackage.storeCollections` — only ever `["featured"]` or `undefined` here, Snapcraft has no verified/recently-added/updated collection API. */
  storeCollections?: StoreCollectionTag[];
  /** See `SourcedPackage.categories` — already translated from Snap's own store-category vocabulary to the freedesktop-equivalent tags `pickCategory` understands, see fetch.ts's `SNAP_CATEGORY_TO_FREEDESKTOP`. */
  categories?: string[];
  /** See `SourcedPackage.hasGameCategory` — set from the dedicated "games" store category, which has no genre granularity to translate. */
  hasGameCategory?: boolean;
}

export interface SnapcraftFetchMetadata extends FetchMetadata {
  /** `Snap-Device-Series` header value sent with every request. */
  deviceSeries: string;
  /** Pages of the v1 search walked this run. */
  listingPagesFetched: number;
  /** How many snaps that listing held; the cache can hold a few more, see `mergeEntries`. */
  listedSnaps: number;
  /** `/v2/snaps/info` calls that answered this run. The other snaps keep their previous channels and categories. */
  detailsFetched: number;
  /** `/v2/snaps/info` calls that kept failing, left for a later run. */
  detailsFailed: number;
  /** Snaps `/v2/snaps/info` said no longer exist, dropped from the cache. */
  snapsGone: number;
  /** Requests this run made to the store, retries aside. */
  requests: number;
}
