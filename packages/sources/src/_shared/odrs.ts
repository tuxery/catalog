import { fetchOrThrow } from "./http";

// GNOME's ODRS (odrs.gnome.org) is the community ratings/reviews backend
// behind GNOME Software and Flathub's own star ratings — public,
// unauthenticated, and genuinely bulk: one GET returns every rated app in
// a single JSON object, no pagination. Keyed by whatever app-id string
// each review was originally submitted under — the same id space
// Flathub and elementary AppCenter both publish (`AppstreamComponent.id`),
// so this is usable by both without per-source-specific handling.
// Entries with `total: 0` are skipped rather than surfaced as a "0 rating".
const RATINGS_URL = "https://odrs.gnome.org/1.0/reviews/api/ratings";

interface RawRatings {
  star0?: number;
  star1?: number;
  star2?: number;
  star3?: number;
  star4?: number;
  star5?: number;
  total?: number;
}

export interface OdrsRating {
  /** Mean star rating (1-5), weighted by each star bucket's vote count. */
  average: number;
  count: number;
}

/** Computes a weighted mean from ODRS's per-star vote buckets. Pure — no I/O. star0 is a deprecated/unused bucket in real ODRS data, left out of the average. */
export function averageRating(raw: RawRatings): number {
  const weighted =
    (raw.star1 ?? 0) * 1 +
    (raw.star2 ?? 0) * 2 +
    (raw.star3 ?? 0) * 3 +
    (raw.star4 ?? 0) * 4 +
    (raw.star5 ?? 0) * 5;
  return weighted / (raw.total ?? 1);
}

/**
 * Downloads ODRS's full ratings dump and returns it keyed by lowercased
 * app-id, skipping entries with no real votes. Lowercased because the
 * dump mixes id casing from whenever each app's reviews were first
 * submitted (e.g. `org.mozilla.Firefox`, capital F, vs. Flathub's own
 * current AppStream id and this codebase's `SourcedPackage.appId`,
 * both lowercase). Shared by Flathub and AppCenter's `fetch.ts` — a
 * single fetch call each connector joins against its own appstream
 * entries via `pickOdrsRating`. See docs/sources.md.
 */
export async function fetchOdrsRatings(): Promise<Map<string, OdrsRating>> {
  const response = await fetchOrThrow(RATINGS_URL, "ODRS ratings");
  const raw = (await response.json()) as Record<string, RawRatings>;

  const ratings = new Map<string, OdrsRating>();
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry.total) continue;
    ratings.set(id.toLowerCase(), { average: averageRating(entry), count: entry.total });
  }
  return ratings;
}

/**
 * Looks up an AppStream component's ODRS rating, case-insensitively.
 * ODRS itself never migrated old review submissions onto one canonical
 * id shape — the same app can have genuinely separate vote pools under
 * its bare AppStream id (`org.mozilla.Firefox`) and the older
 * `.desktop`-suffixed GNOME Software convention
 * (`org.mozilla.Firefox.desktop`), sometimes both at once with different
 * vote counts each. Both are looked up and combined into one
 * count-weighted average rather than picking just one and silently
 * dropping the other's votes. Pure — no I/O.
 */
export function pickOdrsRating(
  ratings: Map<string, OdrsRating>,
  appstreamId: string,
): OdrsRating | undefined {
  const candidates = [
    ratings.get(appstreamId.toLowerCase()),
    ratings.get(`${appstreamId}.desktop`.toLowerCase()),
  ].filter((rating): rating is OdrsRating => rating !== undefined);
  if (candidates.length === 0) return undefined;

  const count = candidates.reduce((sum, rating) => sum + rating.count, 0);
  const weightedSum = candidates.reduce((sum, rating) => sum + rating.average * rating.count, 0);
  return { average: weightedSum / count, count };
}
