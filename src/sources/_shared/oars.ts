/**
 * OARS (Open Age Ratings Service) attributes mapped to a minimum age in
 * years, the way libappstream does it
 * (`oars_to_csm_mappings` in `as-content-rating.c`, from Common Sense
 * Media's guidance): one row per attribute, the age for `mild`,
 * `moderate` and `intense` (`none` is always 0). A rating's minimum age
 * is the highest age among its attributes. Copied 2026-10-12.
 */
const OARS_AGES: Record<string, readonly [mild: number, moderate: number, intense: number]> = {
  "violence-cartoon": [3, 4, 6],
  "violence-fantasy": [3, 7, 8],
  "violence-realistic": [4, 9, 14],
  "violence-bloodshed": [9, 11, 18],
  "violence-sexual": [18, 18, 18],
  "drugs-alcohol": [11, 13, 16],
  "drugs-narcotics": [12, 14, 17],
  "drugs-tobacco": [10, 13, 13],
  "sex-nudity": [12, 14, 14],
  "sex-themes": [13, 14, 15],
  "language-profanity": [8, 11, 14],
  "language-humor": [3, 8, 14],
  "language-discrimination": [9, 10, 11],
  "money-advertising": [7, 8, 10],
  "money-gambling": [7, 10, 18],
  "money-purchasing": [12, 14, 15],
  "social-chat": [4, 10, 13],
  "social-audio": [15, 15, 15],
  "social-contacts": [12, 12, 12],
  "social-info": [0, 13, 13],
  "social-location": [13, 13, 13],
  // OARS 1.1
  "sex-homosexuality": [13, 14, 15],
  "sex-prostitution": [12, 14, 18],
  "sex-adultery": [8, 10, 18],
  "sex-appearance": [10, 10, 15],
  "violence-worship": [13, 15, 18],
  "violence-desecration": [13, 15, 18],
  "violence-slavery": [13, 15, 18],
};

export const OARS_INTENSITIES = ["none", "mild", "moderate", "intense"] as const;

/** The minimum age one OARS attribute at one intensity implies; 0 for an attribute or intensity it doesn't know. */
export function oarsAttributeAge(id: string, intensity: string): number {
  const rank = OARS_INTENSITIES.indexOf(intensity as never);
  return rank <= 0 ? 0 : (OARS_AGES[id]?.[rank - 1] ?? 0);
}
