import { createHash } from "node:crypto";
import { parallel, retry } from "helpers4/promise";
import { fetchOrThrow, withUserAgent } from "../_shared/http";
import { readMetadata, writeMetadata } from "../_shared/metadata";
import { readNdjson, writeNdjson } from "../_shared/ndjson";
import type { ProjectLinks, StoreCollectionTag } from "../types";
import type { SnapcraftCacheEntry, SnapcraftChannel, SnapcraftFetchMetadata } from "./types";

// How this source is read, chosen on 2026-11-09 to replace a sweep of about
// 134,000 requests a week (recursive `q=` prefixes on /v2/snaps/find, globally
// and per store category; figures in docs/sources.md):
//
// 1. One pass over the v1 search, which unlike v2's `find` is paged: about 47
//    requests for every listed snap with its title, summary, description,
//    license, publisher, media and links. 99.8% identical to `find`'s fields.
// 2. One `/v2/snaps/info` call only for the snaps that need one, for what the
//    listing doesn't carry (channel-map, store categories).
// 3. Everything else keeps what the previous cache says about it.
const LIST_URL = "https://api.snapcraft.io/api/v1/snaps/search";
// The server's own ceiling: `size=500` answers with 250.
const LIST_PAGE_SIZE = 250;
// `devmode` snaps can't be installed without a flag; the `find` sweep never saw them either.
const LIST_PARAMS = "scope=wide&confinement=strict,classic";
const LIST_PAGE_PAUSE_MS = 500;
// A listing this much shorter than the last cache is an API problem, not snaps
// going away: fail and keep the cache rather than rewriting it from a fragment.
const MIN_LISTED_SHARE = 0.9;

const INFO_URL = "https://api.snapcraft.io/v2/snaps/info";
// A channel other than the latest stable one can move without the listing
// showing it (about 4% of snaps a week), and so can a store category: each
// snap gets a call at least this often, whatever the listing says.
const INFO_ROTATION_WEEKS = 4;
const INFO_CONCURRENCY = 4;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Snapcraft's own hand-picked "featured" collection, tagged through
// `SourcedPackage.storeCollections`. About 100 snaps, in one call.
const FIND_URL = "https://api.snapcraft.io/v2/snaps/find";
const FEATURED_PARAMS = "featured=true";

const DEVICE_SERIES = "16";
const RISKS = new Set(["stable", "candidate", "beta", "edge"]);
// The cache is x86_64 like Flathub's; the channel-map lists every arch.
const ARCH = "amd64";
const RETRIES = 4;
const RETRY_BASE_DELAY_MS = 1000;

// Snapcraft's own store-category vocabulary (development, art-and-design,
// ...) doesn't share freedesktop.org's category vocabulary the rest of the
// catalog's classifier expects (SourcedPackage.categories, enrich/
// category.ts's pickCategory) — most of it doesn't map cleanly onto ours
// at all. Checked live and rejected: devices-and-iot and health-and-fitness
// (no equivalent category exists), entertainment (mixes media players,
// downloaders, a terminal toy, and a real-time-strategy game — too vague
// to place), personalisation (mixes disk-cleaners and a graphical shell in
// with actual wallpapers/themes), server-and-cloud (Kubernetes/infra/
// sysadmin tooling, a different concept from our desktop-scoped "System
// Tools"), featured (not a real category, already its own storeCollections
// tag above). Only the mappings below were verified live to line up
// closely enough with an existing freedesktop key to reuse it outright —
// no new category or config file needed, pickCategory picks it up
// unchanged since it's keyed by the same freedesktop vocabulary Flathub/
// AppCenter already populate this field with.
const SNAP_CATEGORY_TO_FREEDESKTOP: Record<string, string> = {
  "art-and-design": "Graphics",
  "books-and-reference": "Documentation",
  development: "Development",
  education: "Education",
  finance: "Finance",
  "music-and-audio": "Audio",
  "news-and-weather": "News",
  "photo-and-video": "Photography",
  productivity: "Office",
  science: "Science",
  security: "Security",
  social: "Chat",
  utilities: "Utility",
};

interface RawMedia {
  type?: string;
  url?: string;
}

// Snap's link keys onto Tuxery's project link types. `website` is the
// homepage, kept apart; `contact` is sometimes a bare email, which
// `mapLinks` leaves out.
const SNAP_LINK_TO_PROJECT_LINK: Record<string, keyof ProjectLinks> = {
  issues: "bugtracker",
  source: "vcs-browser",
  donations: "donation",
  contact: "contact",
};

interface RawResult {
  name: string;
  revision?: { channel?: string; version?: string };
  snap?: {
    title?: string;
    summary?: string;
    description?: string;
    license?: string;
    publisher?: { "display-name"?: string; validation?: string };
    media?: RawMedia[];
    links?: Record<string, string[] | undefined>;
  };
}

/** Snap's link lists reduced to one `http(s)` URL per project link type, `undefined` when none. Pure — no I/O. */
export function mapLinks(
  links: Record<string, string[] | undefined> | undefined,
): ProjectLinks | undefined {
  const mapped: ProjectLinks = {};
  for (const [key, type] of Object.entries(SNAP_LINK_TO_PROJECT_LINK)) {
    const href = links?.[key]?.find((url) => /^https?:\/\//i.test(url));
    if (href) mapped[type] = href;
  }
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

/**
 * Maps one sweep's raw `/v2/snaps/find` results to cache rows. Pure — no
 * I/O — so it's the part covered by tests.
 */
export function mapResults(results: RawResult[]): SnapcraftCacheEntry[] {
  return results
    .filter((result) => result.name)
    .map((result) => {
      const screenshotUrls = result.snap?.media
        ?.filter((media) => media.type === "screenshot" && media.url)
        .map((media) => media.url as string);
      return {
        name: result.name,
        title: result.snap?.title ?? result.name,
        summary: result.snap?.summary ?? "",
        version: result.revision?.version ?? "unknown",
        channel: result.revision?.channel ?? "stable",
        iconUrl: result.snap?.media?.find((media) => media.type === "icon")?.url,
        website: result.snap?.links?.website?.[0],
        longDescription: result.snap?.description?.trim() || undefined,
        license: result.snap?.license?.trim() || undefined,
        publisher: result.snap?.publisher?.["display-name"]?.trim() || undefined,
        publisherVerified: result.snap?.publisher?.validation === "verified" || undefined,
        screenshots: screenshotUrls?.length ? screenshotUrls : undefined,
        links: mapLinks(result.snap?.links),
      };
    });
}

/** Tags each entry `["featured"]` when its name is in the featured-collection sweep's result set, `undefined` otherwise. Pure — no I/O. */
export function applyFeaturedTag(
  entries: SnapcraftCacheEntry[],
  featuredNames: Set<string>,
): SnapcraftCacheEntry[] {
  return entries.map((entry) =>
    Object.assign(entry, {
      storeCollections: featuredNames.has(entry.name)
        ? (["featured"] satisfies StoreCollectionTag[])
        : undefined,
    }),
  );
}

/**
 * What a snap's store categories (`/v2/snaps/info`'s `categories`) mean here:
 * the freedesktop-equivalent tags `pickCategory` understands (see
 * `SNAP_CATEGORY_TO_FREEDESKTOP` above), and the dedicated "games" category as
 * `hasGameCategory` — Snap's own vocabulary has no game-genre granularity to
 * translate onto `GAME_CATEGORY_LABELS`. Pure — no I/O.
 */
export function mapCategories(
  names: string[],
): Pick<SnapcraftCacheEntry, "categories" | "hasGameCategory"> {
  const tags = new Set<string>();
  for (const name of names) {
    const tag = SNAP_CATEGORY_TO_FREEDESKTOP[name];
    if (tag) tags.add(tag);
  }
  return {
    categories: tags.size > 0 ? [...tags] : undefined,
    hasGameCategory: names.includes("games") || undefined,
  };
}

interface RawChannelMapEntry {
  channel?: { name?: string; architecture?: string; "released-at"?: string };
  version?: string;
}

/**
 * Keeps one channel per name from a snap's channel-map, amd64 only, branches dropped — the
 * map lists every architecture, and the same channel once per arch. Pure —
 * no I/O — so it's the part covered by tests.
 */
export function mapChannelMap(channelMap: RawChannelMapEntry[]): SnapcraftChannel[] {
  const byName = new Map<string, SnapcraftChannel>();
  for (const item of channelMap) {
    const channel = item.channel?.name;
    if (item.channel?.architecture !== ARCH || !channel || !item.version) continue;
    // A branch (`22/stable/hotfix`) is a short-lived fix for one customer, not a line to pick.
    if (!RISKS.has(channel.split("/").at(-1) ?? "")) continue;
    byName.set(channel, {
      channel,
      version: item.version,
      releasedAt: item.channel?.["released-at"],
    });
  }
  return [...byName.values()];
}

/** One snap as the v1 search lists it. */
export interface RawListing {
  package_name: string;
  title?: string;
  summary?: string;
  description?: string;
  version?: string;
  channel?: string;
  license?: string;
  publisher?: string;
  developer_validation?: string;
  icon_url?: string;
  screenshot_urls?: string[];
  links?: Record<string, string[] | undefined>;
  /** When the latest stable revision was released: it moves with a rebuild of the same version. */
  last_updated?: string;
}

/** A v1 listing in the shape of a v2 `find` result, so `mapResults` reads both. Pure — no I/O. */
export function listingToResult(listing: RawListing): RawResult {
  return {
    name: listing.package_name,
    revision: { channel: listing.channel, version: listing.version },
    snap: {
      title: listing.title,
      summary: listing.summary,
      description: listing.description,
      license: listing.license,
      publisher: {
        "display-name": listing.publisher,
        validation: listing.developer_validation,
      },
      media: [
        ...(listing.icon_url ? [{ type: "icon", url: listing.icon_url }] : []),
        ...(listing.screenshot_urls ?? []).map((url) => ({ type: "screenshot", url })),
      ],
      links: listing.links,
    },
  };
}

/** The week `name` gets its periodic `info` call in, stable across runs and machines. Pure — no I/O. */
export function rotationSlot(name: string): number {
  return createHash("sha256").update(name).digest().readUInt32BE(0) % INFO_ROTATION_WEEKS;
}

/**
 * Which snaps get an `info` call this run: a new one, one whose latest stable
 * revision moved, a listed one a past call failed for, and this week's share of
 * all the others, those no longer listed included (a snap can be unlisted and
 * still exist: most of those have no amd64 build). Pure — no I/O.
 */
export function pickSnapsToDetail(
  listings: RawListing[],
  previous: ReadonlyMap<string, SnapcraftCacheEntry>,
  previousFetchedAt: string | undefined,
  week: number,
): string[] {
  const slot = week % INFO_ROTATION_WEEKS;
  const picked = new Set<string>();
  for (const listing of listings) {
    const known = previous.get(listing.package_name);
    const moved =
      known?.version !== listing.version ||
      (previousFetchedAt !== undefined &&
        listing.last_updated !== undefined &&
        Date.parse(listing.last_updated) > Date.parse(previousFetchedAt));
    if (moved || !known?.channels) picked.add(listing.package_name);
  }
  for (const name of [...previous.keys(), ...listings.map((listing) => listing.package_name)]) {
    if (rotationSlot(name) === slot) picked.add(name);
  }
  return [...picked];
}

/** What an `info` call found: the snap's details, that it no longer exists, or nothing usable. */
export type SnapDetails =
  | { status: "ok"; channels?: SnapcraftChannel[]; categoryNames: string[] }
  | { status: "gone" }
  | { status: "failed" };

/**
 * The new cache from this run's listing, its `info` calls and the previous
 * cache: known snaps in their previous order, new ones after them by name. That
 * order matters beyond a small diff: a merged app's id comes from its first
 * snap, and an id is a URL and an LLM classification's key. What wasn't asked
 * again keeps its previous value. A failed call leaves the snap as it was,
 * version included, so the next run asks again. A snap no longer listed stays
 * until `info` says it's gone: the listing can't tell removed from unlisted.
 * Pure — no I/O.
 */
export function mergeEntries(
  listings: RawListing[],
  previous: ReadonlyMap<string, SnapcraftCacheEntry>,
  details: ReadonlyMap<string, SnapDetails>,
  featuredNames: Set<string>,
): SnapcraftCacheEntry[] {
  const merged = new Map<string, SnapcraftCacheEntry>();
  for (const [name, known] of previous) {
    if (details.get(name)?.status !== "gone") merged.set(name, { ...known });
  }
  for (const entry of mapResults(listings.map(listingToResult))) {
    const known = previous.get(entry.name);
    merged.set(entry.name, {
      ...entry,
      version:
        details.get(entry.name)?.status === "failed" && known ? known.version : entry.version,
      // In the order they've always been written, so an unchanged line stays one.
      storeCollections: undefined,
      categories: known?.categories,
      hasGameCategory: known?.hasGameCategory,
      channels: known?.channels,
    });
  }
  for (const [name, detail] of details) {
    const entry = merged.get(name);
    if (entry && detail.status === "ok") {
      entry.channels = detail.channels;
      Object.assign(entry, mapCategories(detail.categoryNames));
    }
  }
  const added = [...merged.values()]
    .filter((entry) => !previous.has(entry.name))
    .toSorted((a, b) => (a.name < b.name ? -1 : 1));
  const kept = [...merged.values()].filter((entry) => previous.has(entry.name));
  return applyFeaturedTag([...kept, ...added], featuredNames);
}

/** A snap's channels and store categories, see `SnapDetails`. */
async function fetchDetails(name: string): Promise<SnapDetails> {
  try {
    return await retry(
      async () => {
        const response = await fetch(
          `${INFO_URL}/${encodeURIComponent(name)}?fields=version,channel-map,categories`,
          withUserAgent({ headers: { "Snap-Device-Series": DEVICE_SERIES } }),
        );
        if (response.status === 404) return { status: "gone" } as const;
        if (!response.ok) throw new Error(`Snapcraft info "${name}": ${response.status}`);
        const body = (await response.json()) as {
          "channel-map"?: RawChannelMapEntry[];
          snap?: { categories?: { name?: string }[] };
        };
        const channels = mapChannelMap(body["channel-map"] ?? []);
        return {
          status: "ok",
          channels: channels.length > 0 ? channels : undefined,
          categoryNames: (body.snap?.categories ?? []).flatMap((category) =>
            category.name ? [category.name] : [],
          ),
        } as const;
      },
      {
        attempts: RETRIES,
        delayMs: (attempt) => RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
      },
    );
  } catch {
    return { status: "failed" };
  }
}

interface ListingPage {
  _embedded?: { "clickindex:package"?: RawListing[] };
  _links?: { next?: unknown };
}

/** Every listed snap, page after page, with a pause in between. */
async function fetchListing(): Promise<{ listings: RawListing[]; pages: number }> {
  const byName = new Map<string, RawListing>();
  let pages = 0;
  for (let page = 1; ; page++) {
    const url = `${LIST_URL}?size=${LIST_PAGE_SIZE}&page=${page}&${LIST_PARAMS}`;
    // eslint-disable-next-line no-await-in-loop
    const body = await retry(
      async () => {
        const response = await fetchOrThrow(url, `Snapcraft listing page ${page}`, {
          headers: { "X-Ubuntu-Series": DEVICE_SERIES, Accept: "application/hal+json" },
        });
        return (await response.json()) as ListingPage;
      },
      {
        attempts: RETRIES,
        delayMs: (attempt) => RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
      },
    );
    pages++;
    for (const listing of body["_embedded"]?.["clickindex:package"] ?? []) {
      if (listing.package_name) byName.set(listing.package_name, listing);
    }
    if (!body["_links"]?.next) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, LIST_PAGE_PAUSE_MS));
  }
  return { listings: [...byName.values()], pages };
}

async function fetchFeaturedNames(): Promise<Set<string>> {
  const results = await retry(
    async () => {
      const response = await fetchOrThrow(
        `${FIND_URL}?${FEATURED_PARAMS}&fields=title`,
        'Snapcraft "featured"',
        { headers: { "Snap-Device-Series": DEVICE_SERIES } },
      );
      return ((await response.json()) as { results?: { name?: string }[] }).results ?? [];
    },
    {
      attempts: RETRIES,
      delayMs: (attempt) => RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
    },
  );
  return new Set(results.flatMap((result) => (result.name ? [result.name] : [])));
}

/**
 * Refreshes the cache at `cachePath`, starting from what it already holds: see
 * the top of this file and docs/sources.md. Without a previous cache every snap
 * gets its `info` call, about 12,000 requests instead of about 3,700.
 */
export async function fetchSnapcraft(cachePath: string, now = Date.now()): Promise<number> {
  const previous = new Map(
    readNdjson<SnapcraftCacheEntry>(cachePath).map((entry) => [entry.name, entry]),
  );
  const { listings, pages } = await fetchListing();
  if (listings.length < previous.size * MIN_LISTED_SHARE) {
    throw new Error(
      `Snapcraft listed ${listings.length} snaps against ${previous.size} in the cache: keeping the cache.`,
    );
  }
  const featuredNames = await fetchFeaturedNames();

  const names = pickSnapsToDetail(
    listings,
    previous,
    readMetadata(cachePath)?.fetchedAt,
    Math.floor(now / WEEK_MS),
  );
  let done = 0;
  const results = await parallel(
    names.map((name) => async () => {
      const result = await fetchDetails(name);
      if (++done % 500 === 0) console.error(`snap-snapcraft: details ${done}/${names.length}`);
      return result;
    }),
    INFO_CONCURRENCY,
  );
  const details = new Map(names.map((name, i) => [name, results[i] as SnapDetails]));
  const count = (status: SnapDetails["status"]) =>
    results.filter((result) => result.status === status).length;
  if (count("failed") > 0) console.error(`snap-snapcraft: ${count("failed")} info calls failed`);

  const entries = mergeEntries(listings, previous, details, featuredNames);
  writeNdjson(cachePath, entries);
  writeMetadata<SnapcraftFetchMetadata>(cachePath, {
    source: "snap-snapcraft",
    fetchedAt: new Date(now).toISOString(),
    url: LIST_URL,
    entryCount: entries.length,
    deviceSeries: DEVICE_SERIES,
    listingPagesFetched: pages,
    listedSnaps: listings.length,
    detailsFetched: count("ok"),
    detailsFailed: count("failed"),
    snapsGone: count("gone"),
    requests: pages + 1 + names.length,
  });

  return entries.length;
}
