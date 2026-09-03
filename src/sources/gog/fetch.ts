import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { GogCacheEntry, GogFetchMetadata } from "./types";

// GOG's catalog API is undocumented but real and unauthenticated, already
// relied on by community tools like Heroic/Lutris. `systems=linux` is
// inclusive, not Linux-exclusive (e.g. Firewatch also lists windows/osx) —
// matches "can I install this on Linux", not "Linux only". `limit` caps
// at 100; 200 returns a 400.
const LIMIT = 100;
const BASE_URL = "https://catalog.gog.com/v1/catalog";

// GOG's image CDN only accepts specific `{formatter}` tokens; other guesses
// 400. This one works and gives a reasonable screenshot width (639px).
const SCREENSHOT_FORMATTER = "product_card_v2_mobile_slider_639";

interface RawProduct {
  id?: string;
  slug?: string;
  title?: string;
  productType?: string;
  storeLink?: string;
  developers?: string[];
  screenshots?: string[];
  /** 0-50 scale (e.g. 39 = 3.9/5 stars). 0 when `reviewsCount` is also 0 (no reviews yet), not a real zero rating. */
  reviewsRating?: number;
  reviewsCount?: number;
  genres?: { name: string; slug: string }[];
}

interface RawCatalogPage {
  pages?: number;
  products?: RawProduct[];
}

/** Substitutes GOG's `{formatter}` size placeholder with a working image size. Pure — no I/O. */
export function resolveScreenshotUrl(url: string): string {
  return url.replace("{formatter}", SCREENSHOT_FORMATTER);
}

/**
 * Maps one page's raw products to cache rows, keeping only real games.
 * GOG's catalog also lists "pack" (bundle editions, e.g. an Enhanced
 * Edition alongside the base game) and "dlc" product types — neither is
 * a standalone installable game, so both are excluded here. Pure — no I/O.
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
      rating: product.reviewsCount
        ? { average: (product.reviewsRating ?? 0) / 10, count: product.reviewsCount }
        : undefined,
      genres: (product.genres ?? []).map((genre) => genre.slug),
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
 * published rate-limit guidance, so it's safer not to hammer it. See
 * docs/sources.md.
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
