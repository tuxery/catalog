/**
 * PEGI's age brackets, the scale the site filters and labels products by:
 * 3 is "all ages", 18 adults only. See docs/age-ratings.md.
 */
export const AGE_BRACKETS = [3, 7, 12, 16, 18] as const;

export type AgeBracket = (typeof AGE_BRACKETS)[number];

/**
 * The bracket a minimum age (`CatalogApp.ageRating.value`, in years) falls
 * in, rounded up: the lowest bracket at or above it. Rounding up keeps
 * "suitable for 12" exact, every product in brackets up to 12 has a
 * minimum age of 12 or less, where rounding down (libappstream's
 * `as_content_rating_system_format_age`, what GNOME Software shows) would
 * put an app rated 15 for intense sexual themes in the 12 bracket.
 * `undefined` for a missing or unreadable age: unrated, never all ages.
 */
export function ageBracket(minAge: string | number | undefined): AgeBracket | undefined {
  if (minAge === undefined || (typeof minAge === "string" && minAge.trim() === "")) {
    return undefined;
  }
  const age = Number(minAge);
  if (!Number.isFinite(age) || age < 0) return undefined;
  return AGE_BRACKETS.find((bracket) => age <= bracket) ?? 18;
}
