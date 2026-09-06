import { removeDiacritics } from "helpers4/string";

/**
 * Transliterates diacritics, lowercases, and strips non-alphanumeric
 * characters — the same normalization used both to bucket packages for
 * fuzzy comparison and to detect exact-name matches (e.g. Flathub's
 * "Firefox" vs Debian's "firefox"). Centralized so both tiers agree on
 * what "the same name" means.
 *
 * `removeDiacritics` first, not just a blanket strip — verified live
 * against the full real cache (2026-08-28): a plain strip was silently
 * splitting real apps into two separate catalog entries whenever one
 * source spelled the name with its proper accent and another used the
 * plain-ASCII form. Confirmed real cases: "LÖVE" (Flathub/Lutris) vs
 * "love" (12 other sources) — the same well-known Lua game engine, split
 * into two apps; "Touché" (Flathub) vs "touche" (AUR) and "Protégé"
 * (Flathub) vs "protege" (Arch/Nixpkgs), both same-homepage same-app
 * pairs. `removeDiacritics` Unicode-decomposes each character (NFKD) and
 * strips the combining marks, which also happens to resolve "™" to "TM"
 * as a side effect of that decomposition (a real, correct Unicode
 * mapping, not a special case coded here). Only 20 of 427,656 real
 * name/appId strings in the cache changed output at all — one of those,
 * "Tabëla" vs "tabela", is a real false-merge risk (two genuinely
 * different apps that coincidentally share the plain-ASCII spelling) and
 * is guarded in config/match-deny.json instead of being left to this
 * function to somehow special-case.
 */
export function normalizeName(name: string): string {
  return removeDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
