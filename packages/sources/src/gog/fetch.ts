import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { GogCacheEntry, GogFetchMetadata } from "./types";

// GOG's catalog API (catalog.gog.com/v1/catalog) is undocumented but real,
// public, and unauthenticated — confirmed working live and already relied
// on by community tools (Heroic Games Launcher, Lutris) that need to
// query GOG's own catalog themselves, not just a scraped guess.
// `systems=linux` filters server-side to Linux-compatible products
// (verified live: 2,658 of 12,589 total, ~21%) — inclusive, not
// Linux-exclusive (e.g. Firewatch's own `operatingSystems` is
// `["windows", "linux", "osx"]`), matching "can I install this on
// Linux" rather than "Linux only", the same spirit as every other
// source here. `limit` caps at 100 (a `limit=200` request returns a
// real 400 "Invalid request parameters").
const LIMIT = 100;
const BASE_URL = "https://catalog.gog.com/v1/catalog";

// Verified live against a real screenshot URL's `{formatter}` placeholder
// — GOG's image CDN rejects arbitrary tokens (most guesses return a real
// 400), this one is confirmed working and a reasonable screenshot size
// (639px wide).
const SCREENSHOT_FORMATTER = "product_card_v2_mobile_slider_639";

interface RawProduct {
  id?: string;
  slug?: string;
  title?: string;
  productType?: string;
  storeLink?: string;
  developers?: string[];
  screenshots?: string[];
}

interface RawCatalogPage {
  pages?: number;
  products?: RawProduct[];
}

/** Substitutes GOG's `{formatter}` size placeholder for a verified-working real image size. Pure — no I/O. */
export function resolveScreenshotUrl(url: string): string {
  return url.replace("{formatter}", SCREENSHOT_FORMATTER);
}

/**
 * Maps one page's raw products to cache rows, keeping only real games —
 * GOG's catalog also lists "pack" (bundle editions, e.g. "Planescape:
 * Torment: Enhanced Edition" alongside the base "Planescape: Torment")
 * and "dlc" (add-on content requiring the base game already installed)
 * product types, neither a standalone installable game the way this
 * catalog's other sources are — excluded here rather than shipping
 * near-duplicate or non-installable entries. Pure — no I/O.
 */
export function mapProducts(products: RawProduct[]): GogCacheEntry[] {
  return products
    .filter(
      (product): product is RawProduct & { id: string; title: string; slug: string } =>
        product.productType === "game" && Boolean(product.id && product.title && product.slug),
    )
    .map((product) => ({
      id: product.id,
      title: product.title,
      slug: product.slug,
      storeLink: product.storeLink,
      developers: product.developers ?? [],
      screenshots: (product.screenshots ?? []).map(resolveScreenshotUrl),
    }));
}

async function fetchPage(page: number): Promise<RawCatalogPage> {
  const url = `${BASE_URL}?limit=${LIMIT}&systems=linux&page=${page}`;
  const response = await fetchOrThrow(url, `GOG catalog page ${page}`);
  return (await response.json()) as RawCatalogPage;
}

/**
 * Downloads every Linux-compatible product from GOG's catalog API and
 * writes the normalized entries to `cachePath` as NDJSON. Paginated
 * sequentially, not concurrently — this is an undocumented API with no
 * published rate-limit guidance, and ~27 real pages at the current
 * catalog size isn't large enough to need concurrency's added risk (same
 * "be conservative against an API with no documented limits" reasoning
 * as AppImage's capped GitHub lookups). See docs/sources.md.
 */
export async function fetchGog(cachePath: string): Promise<number> {
  const first = await fetchPage(1);
  const totalPages = first.pages ?? 1;

  const pages = [first];
  for (let page = 2; page <= totalPages; page++) {
    // eslint-disable-next-line no-await-in-loop
    pages.push(await fetchPage(page));
  }

  const entries = mapProducts(pages.flatMap((p) => p.products ?? []));

  writeNdjson(cachePath, entries);
  writeMetadata<GogFetchMetadata>(cachePath, {
    source: "gog",
    fetchedAt: new Date().toISOString(),
    url: `${BASE_URL}?systems=linux`,
    entryCount: entries.length,
    systemsFilter: "linux",
    pagesFetched: totalPages,
  });

  return entries.length;
}
