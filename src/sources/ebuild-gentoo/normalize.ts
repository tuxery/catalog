import type { SourcedPackage } from "../types";
import type { GentooCacheEntry } from "./types";

/**
 * Gentoo ships stable and testing ebuilds in one tree; `KEYWORDS` marks the
 * stability per architecture. Tuxery targets amd64: `amd64` is stable,
 * `~amd64` is testing, and anything else (no amd64 keyword, a `-amd64`
 * mask, empty keywords) is left undefined rather than guessed.
 */
export function channelFromKeywords(
  keywords: string | undefined,
): "stable" | "testing" | undefined {
  const tokens = keywords?.split(/\s+/) ?? [];
  if (tokens.includes("amd64")) return "stable";
  if (tokens.includes("~amd64")) return "testing";
  return undefined;
}

export function normalize(entries: GentooCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "ebuild-gentoo",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // Gentoo's real unique identifier is category/name (e.g.
    // "games-strategy/0ad"), since the same package name can exist in
    // different categories — the category is folded into appId rather
    // than dropped, unlike bare `entry.name`.
    appId: `${entry.category}/${entry.name}`,
    homepage: entry.homepage,
    // Gentoo's category (e.g. "games-strategy", "dev-libs") serves the
    // same Section-equivalent role Debian/openSUSE/Slackware/Solus's
    // fields do — see filter/rules.ts's GENTOO_NOISE_CATEGORIES.
    section: entry.category,
    channel: channelFromKeywords(entry.keywords),
  }));
}
