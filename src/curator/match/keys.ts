import { unorderedPairKey } from "helpers4/string";
import type { SourcedPackage } from "../../sources";
import type { MatchPackageRef } from "./types";

/** Canonical union-find key for a package — its source + appId, falling back to name if appId is somehow absent. */
export function packageKey(
  pkg: Pick<SourcedPackage, "source" | "name"> & { appId?: string },
): string {
  return `${pkg.source}:${pkg.appId ?? pkg.name}`;
}

export function refKey(ref: MatchPackageRef): string {
  return `${ref.source}:${ref.appId}`;
}

/** Canonical, order-independent key for a pair — same result for (a,b) and (b,a). */
export const pairKey = unorderedPairKey;
