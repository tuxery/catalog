import { fetchOrThrow } from "./http";

interface LaunchpadSeries {
  name: string;
  status: string;
}

/**
 * Resolves the current stable release's codename from Launchpad's public
 * series list. Ubuntu has no Debian-`stable`-style always-current URL
 * alias in the archive itself (codenames are the only suite identifier,
 * and both LTS and interim releases stay "Supported" long after they stop
 * being current), so this leans on Launchpad's own
 * `status: "Current Stable Release"` marker instead, which names exactly
 * one series at a time — the same one a fresh `apt` install would use.
 * Shared by deb-ubuntu and deb-ubuntu-appstream, which must describe the
 * exact same package set for the DEP-11 `Package:` join to land — the
 * same situation `_shared/fedora-release.ts` covers for Fedora and RPM
 * Fusion. Pure — no I/O — given an already-fetched series list.
 */
export function resolveCurrentSuite(series: LaunchpadSeries[]): string {
  const current = series.find((entry) => entry.status === "Current Stable Release");
  if (!current) {
    throw new Error("Launchpad reported no current Ubuntu stable release");
  }

  return current.name;
}

export async function fetchCurrentSuite(): Promise<string> {
  const response = await fetchOrThrow(
    "https://api.launchpad.net/devel/ubuntu/series",
    "Launchpad Ubuntu series",
  );
  const { entries } = (await response.json()) as { entries: LaunchpadSeries[] };
  return resolveCurrentSuite(entries);
}
