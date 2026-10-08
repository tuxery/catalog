import { nameAxes } from "../_shared/name-axes";
import type { Risk, SourcedPackage } from "../types";
import type { GentooCacheEntry } from "./types";

/**
 * Gentoo ships stable and testing ebuilds in one tree; `KEYWORDS` marks the
 * stability per architecture. Tuxery targets amd64: `amd64` is stable (no
 * risk), `~amd64` is a release Gentoo is still testing — the `candidate`
 * risk (docs/product-families.md). Anything else (no amd64 keyword, a
 * `-amd64` mask, empty keywords) is left at the default rather than
 * guessed.
 */
export function riskFromKeywords(keywords: string | undefined): Risk | undefined {
  const tokens = keywords?.split(/\s+/) ?? [];
  return !tokens.includes("amd64") && tokens.includes("~amd64") ? "candidate" : undefined;
}

export function normalize(entries: GentooCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => {
    const { risk, flavors } = nameAxes(entry.name);
    return {
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
      risk: riskFromKeywords(entry.keywords) ?? risk,
      flavors,
      // Gentoo's `-bin` ebuilds install upstream's own binaries, packaged by
      // Gentoo developers — upstream bits through the distro's own repo.
      // Everything else gets the source default (`distro`, see
      // `_shared/provenance.ts`).
      provenance: flavors?.includes("bin") ? "upstream" : undefined,
    };
  });
}
