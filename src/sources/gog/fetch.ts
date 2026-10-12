import { parallel, retry } from "helpers4/promise";
import { flattenHtmlDescription } from "../_shared/dep11";
import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { AgeRating } from "../types";
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

const PRODUCT_URL = "https://api.gog.com/products";
// One product call per game (~1,400 in all), bounded like the other
// per-item lookups (Snap's channel-maps).
const DETAIL_CONCURRENCY = 8;
const DETAIL_RETRIES = 3;

interface RawProductDetails {
  images?: { icon?: string };
  description?: { lead?: string; full?: string };
}

interface RawProduct {
  id?: string;
  slug?: string;
  title?: string;
  productType?: string;
  storeLink?: string;
  developers?: string[];
  publishers?: string[];
  screenshots?: string[];
  /** 0-50 scale (e.g. 39 = 3.9/5 stars). 0 when `reviewsCount` is also 0 (no reviews yet), not a real zero rating. */
  reviewsRating?: number;
  reviewsCount?: number;
  genres?: { name: string; slug: string }[];
  ratings?: { name?: string; ageRating?: string }[];
}

interface RawCatalogPage {
  pages?: number;
  products?: RawProduct[];
}

// GOG lists a product's age rating per national system, as the minimum age
// in years. PEGI first (the European standard), then the others.
const AGE_SYSTEMS = [
  ["pegiRating", "PEGI"],
  ["esrbRating", "ESRB"],
  ["uskRating", "USK"],
] as const;

/** The first of PEGI, ESRB or USK the product has, as an `AgeRating` (its age is its minimum age). Pure — no I/O. */
export function pickAgeRating(ratings: RawProduct["ratings"]): AgeRating | undefined {
  for (const [name, system] of AGE_SYSTEMS) {
    const age = Number(ratings?.find((rating) => rating.name === name)?.ageRating);
    if (Number.isInteger(age) && age >= 0) return { system, value: String(age), minAge: age };
  }
  return undefined;
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
      publisher: product.publishers?.length ? product.publishers.join(", ") : undefined,
      screenshots: (product.screenshots ?? []).map(resolveScreenshotUrl),
      rating: product.reviewsCount
        ? { average: (product.reviewsRating ?? 0) / 10, count: product.reviewsCount }
        : undefined,
      genres: (product.genres ?? []).map((genre) => genre.slug),
      ageRating: pickAgeRating(product.ratings),
    }));
}

/** The icon URL and plain-text description of one `api.gog.com/products/<id>` response. Pure — no I/O. */
export function mapProductDetails(
  details: RawProductDetails,
): Pick<GogCacheEntry, "iconUrl" | "longDescription"> {
  // GOG serves its images protocol-relative (`//images-3.gog-statics.com/...`).
  const icon = details.images?.icon;
  const html = details.description?.full || details.description?.lead;
  return {
    iconUrl: icon ? new URL(icon, "https://images.gog-statics.com").href : undefined,
    longDescription: html ? flattenHtmlDescription(html) || undefined : undefined,
  };
}

async function fetchDetails(
  id: string,
): Promise<Pick<GogCacheEntry, "iconUrl" | "longDescription"> | undefined> {
  try {
    const response = await retry(
      () => fetchOrThrow(`${PRODUCT_URL}/${id}?expand=description`, `GOG product ${id}`),
      { attempts: DETAIL_RETRIES, delayMs: (attempt) => 500 * 2 ** (attempt - 1) },
    );
    return mapProductDetails((await response.json()) as RawProductDetails);
  } catch {
    return undefined;
  }
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

  const listed = mapProducts(pages.flatMap((p) => p.products ?? []));
  const details = await parallel(
    listed.map((entry) => () => fetchDetails(entry.id)),
    DETAIL_CONCURRENCY,
  );
  const entries = listed.map((entry, i) => Object.assign(entry, details[i]));

  writeNdjson(cachePath, entries);
  writeMetadata<GogFetchMetadata>(cachePath, {
    source: "gog",
    fetchedAt: new Date().toISOString(),
    url: `${BASE_URL}?systems=linux`,
    entryCount: entries.length,
    systemsFilter: "linux",
    detailsFetched: details.filter(Boolean).length,
    pagesFetched: totalPages,
  });

  return entries.length;
}
