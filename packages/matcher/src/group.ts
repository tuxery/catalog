import type { SourcedPackage } from "@tuxery/sources";
import { scoreMatch } from "./score";

export interface MatchedApp {
  /** Stable id for this group, derived from the first package that formed it. */
  id: string;
  packages: SourcedPackage[];
}

const DEFAULT_THRESHOLD = 0.75;

/**
 * Groups packages from possibly different sources into unified apps using a
 * greedy union: a package joins the first existing group whose members it
 * scores above `threshold` against, otherwise it starts a new group.
 *
 * Deliberately simple (O(n²) pairwise comparisons, no clustering library) —
 * fine for a search result page, not for indexing every package Tuxery
 * knows about. Revisit if/when that becomes the bottleneck.
 */
export function groupPackages(
  packages: SourcedPackage[],
  threshold = DEFAULT_THRESHOLD,
): MatchedApp[] {
  const groups: MatchedApp[] = [];

  for (const pkg of packages) {
    const existingGroup = groups.find((group) =>
      group.packages.some((member) => scoreMatch(member, pkg) >= threshold),
    );

    if (existingGroup) {
      existingGroup.packages.push(pkg);
      continue;
    }

    groups.push({
      id: `${pkg.source}:${pkg.appId ?? pkg.name}`,
      packages: [pkg],
    });
  }

  return groups;
}
