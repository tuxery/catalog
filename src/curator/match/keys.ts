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

/**
 * The id a group would take if this package named it alone (see
 * `group.ts`'s `buildAppId`): Snapcraft's and Flatpak's own globally
 * unique ids as-is, every other source's `source:appId` with `/`
 * normalized to `:`.
 */
export function standaloneAppId(pkg: Pick<SourcedPackage, "source" | "name" | "appId">): string {
  if (pkg.source === "snap-snapcraft") return pkg.appId ?? pkg.name;
  if ((pkg.source === "flatpak-flathub" || pkg.source === "flatpak-appcenter") && pkg.appId) {
    return pkg.appId;
  }
  return `${pkg.source}:${(pkg.appId ?? pkg.name).replaceAll("/", ":")}`;
}
