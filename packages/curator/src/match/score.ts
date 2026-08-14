import type { SourcedPackage } from "@tuxery/sources";
import { levenshteinSimilarity } from "./levenshtein";

/** Weights used by `scoreMatch` — tuned by hand for now, revisit with real data. */
export const MATCH_WEIGHTS = {
  name: 0.5,
  appId: 0.35,
  iconFilename: 0.15,
} as const;

/**
 * Scores how likely two packages (typically from different sources, e.g.
 * Flathub vs Snapcraft) represent the same underlying application.
 *
 * Returns a value in [0, 1]. This is a first pass: name distance plus two
 * exact-match signals. Real-world app IDs and icon filenames vary enough
 * across ecosystems (reverse-DNS vs snap name vs desktop file id) that this
 * will need per-source normalization before it's reliable — tracked on the
 * Tuxery GitHub Project, not implemented here yet.
 */
export function scoreMatch(a: SourcedPackage, b: SourcedPackage): number {
  const nameScore = levenshteinSimilarity(a.name, b.name);
  const appIdScore = a.appId && b.appId && a.appId === b.appId ? 1 : 0;
  const iconScore = a.iconFilename && b.iconFilename && a.iconFilename === b.iconFilename ? 1 : 0;

  return (
    nameScore * MATCH_WEIGHTS.name +
    appIdScore * MATCH_WEIGHTS.appId +
    iconScore * MATCH_WEIGHTS.iconFilename
  );
}
