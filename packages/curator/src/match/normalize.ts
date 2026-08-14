/**
 * Lowercases and strips non-alphanumeric characters — the same
 * normalization used both to bucket packages for fuzzy comparison and to
 * detect exact-name matches (e.g. Flathub's "Firefox" vs Debian's
 * "firefox"). Centralized so both tiers agree on what "the same name"
 * means.
 */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
