import { setTimeout as sleep } from "node:timers/promises";
import { fetchOrThrow } from "../_shared/http";
import { readMetadata, writeMetadata } from "../_shared/metadata";
import { readNdjson } from "../_shared/ndjson";
import { writeNdjson } from "../_shared/ndjson";
import type { AppImageHubCacheEntry, AppImageHubFetchMetadata } from "./types";

// AppImageHub (opendesktop.org's AppImage store) through its OCS API. The
// web site's robots.txt disallows everything, so this connector exists only
// because opendesktop.org allowed it (2026-10-20), with conditions:
//
// - one full sweep a week, `pagesize` up to 99 (about 17 requests);
// - this exact User-Agent, so they recognise the traffic;
// - every app using the data links to the item's AppImageHub page as the
//   download destination, with visible "Source: AppImageHub";
// - categories and tags are free to use; names, summaries and versions
//   can't be relicensed: the cache is private (`../_shared/cache-path.ts`)
//   and the data is never redistributed as a dataset.
//
// They may adjust limits or withdraw access, with notice: removing the
// source from `REFRESHERS`/`search.ts` is enough to stop it entirely.
const BASE_URL = "https://api.appimagehub.com/ocs/v1/content/data";
const PAGE_SIZE = 99;
const PAUSE_MS = 2000;
// "One full sweep per week": a sweep closer than this to the last one is
// skipped (`pnpm seed --force` or a manual refresh would otherwise sweep again).
const MIN_DAYS_BETWEEN_SWEEPS = 6;
export const USER_AGENT =
  "TuxeryCatalog/1.0 (+https://github.com/tuxery/catalog; info@tuxery.store)";

interface RawItem {
  id?: string | number;
  name?: string;
  typename?: string;
  summary?: string;
  version?: string;
  download_version1?: string;
  tags?: string;
  detailpage?: string;
  changed?: string;
}

interface RawPage {
  status?: string;
  totalitems?: number;
  data?: RawItem[];
}

/** One page's raw items as cache rows, dropping any without an id, a name or a detail page. Pure — no I/O. */
export function mapItems(items: RawItem[]): AppImageHubCacheEntry[] {
  return items.flatMap((item) => {
    const id = item.id === undefined ? "" : String(item.id);
    const name = item.name?.trim();
    if (!id || !name || !item.detailpage) return [];
    const version = item.version?.trim() || item.download_version1?.trim() || undefined;
    return [
      {
        id,
        name,
        typename: item.typename?.trim() ?? "",
        summary: item.summary?.trim() ?? "",
        version,
        tags: (item.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        detailpage: item.detailpage,
        changed: item.changed,
      },
    ];
  });
}

async function fetchPage(page: number): Promise<RawPage> {
  const url = `${BASE_URL}?format=json&pagesize=${PAGE_SIZE}&page=${page}`;
  const response = await fetchOrThrow(url, `AppImageHub page ${page}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  const body = (await response.json()) as RawPage;
  if (body.status !== "ok") throw new Error(`AppImageHub page ${page}: status ${body.status}`);
  return body;
}

/** Whether a sweep fetched at `fetchedAt` is too recent for another one at `now`. Pure. */
export function sweptRecently(fetchedAt: string | undefined, now: Date): boolean {
  if (!fetchedAt) return false;
  const age = now.getTime() - Date.parse(fetchedAt);
  return age >= 0 && age < MIN_DAYS_BETWEEN_SWEEPS * 24 * 60 * 60 * 1000;
}

/**
 * The weekly full sweep: every page in turn, one request at a time with a
 * pause between them, written to `cachePath` (the private cache). Stops at
 * the first empty page or once `totalitems` is reached.
 */
export async function fetchAppImageHub(cachePath: string): Promise<number> {
  const last = readMetadata<AppImageHubFetchMetadata>(cachePath)?.fetchedAt;
  if (sweptRecently(last, new Date())) {
    console.log(`appimagehub: last sweep ${last}, less than a week ago — skipped, cache kept.`);
    return readNdjson<AppImageHubCacheEntry>(cachePath).length;
  }

  const entries: AppImageHubCacheEntry[] = [];
  let page = 0;
  let total = Infinity;
  while (page * PAGE_SIZE < total) {
    // One request at a time, on purpose: opendesktop.org asked for a slow sweep.
    // eslint-disable-next-line no-await-in-loop
    if (page > 0) await sleep(PAUSE_MS);
    // eslint-disable-next-line no-await-in-loop
    const body = await fetchPage(page);
    total = body.totalitems ?? 0;
    const items = body.data ?? [];
    if (items.length === 0) break;
    entries.push(...mapItems(items));
    page++;
  }

  writeNdjson(cachePath, entries);
  writeMetadata<AppImageHubFetchMetadata>(cachePath, {
    source: "appimagehub",
    fetchedAt: new Date().toISOString(),
    url: BASE_URL,
    entryCount: entries.length,
    pagesFetched: page,
  });
  return entries.length;
}
