import type { SourcedPackage } from "@tuxery/sources";
import { scoreMatch } from "./score";

export interface MatchedApp {
  /** Stable id for this group, derived from the first package that formed it. */
  id: string;
  packages: SourcedPackage[];
}

const DEFAULT_THRESHOLD = 0.75;

// Packages only ever compare within the same bucket, keyed by a normalized
// name prefix — turns the pairwise scan from O(n²) over everything into
// O(n²) per bucket, which is what makes this tractable at real combined
// volume (Flathub + Snapcraft + AppImage + AUR's ~123k packages; a full
// pairwise scan there is billions of Levenshtein calls). 8 chars, not
// fewer: AUR's ecosystem-prefixed naming (python-*, lib*, perl-*, ...)
// means a 2-char prefix alone still leaves a 10k-package "py" bucket —
// verified against the real AUR dump, not assumed; 8 chars splits
// "python-django" from "python-numpy" and gets the worst single bucket
// down to ~1k. Trade-off: two packages whose names don't share this
// prefix after normalization never get compared, even if they're the same
// app under very different names across sources (e.g. "vscode" vs
// "visual-studio-code"). Revisit with a smarter blocking key if that turns
// out to matter in practice — see the "Matcher performance" card.
const BUCKET_PREFIX_LENGTH = 8;

function bucketKey(pkg: SourcedPackage): string {
  const normalized = pkg.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.slice(0, BUCKET_PREFIX_LENGTH) || normalized;
}

/**
 * Groups packages from possibly different sources into unified apps using a
 * greedy union: within its bucket (see `bucketKey`), a package joins the
 * first existing group whose members it scores above `threshold` against,
 * otherwise it starts a new group.
 */
export function groupPackages(
  packages: SourcedPackage[],
  threshold = DEFAULT_THRESHOLD,
): MatchedApp[] {
  const bucketsByKey = new Map<string, MatchedApp[]>();

  for (const pkg of packages) {
    const key = bucketKey(pkg);
    const bucket = bucketsByKey.get(key) ?? [];
    const existingGroup = bucket.find((group) =>
      group.packages.some((member) => scoreMatch(member, pkg) >= threshold),
    );

    if (existingGroup) {
      existingGroup.packages.push(pkg);
    } else {
      bucket.push({ id: `${pkg.source}:${pkg.appId ?? pkg.name}`, packages: [pkg] });
    }

    bucketsByKey.set(key, bucket);
  }

  return [...bucketsByKey.values()].flat();
}
