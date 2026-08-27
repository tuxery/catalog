import type { SourcedPackage } from "../types";
import type { GentooCacheEntry } from "./types";

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
  }));
}
