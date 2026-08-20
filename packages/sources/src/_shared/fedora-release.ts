import { fetchOrThrow } from "./http";

interface BodhiRelease {
  id_prefix: string;
  version: string;
  state: string;
}

/**
 * Resolves the current stable Fedora release number from Bodhi's release
 * list — there's no Debian-`stable`-style always-current URL alias in the
 * Fedora archive itself, but Bodhi's API is the real equivalent. It marks
 * exactly the currently-supported Fedora releases (not EPEL/ELN, which use
 * the same endpoint) `state: "current"` — typically two at once during the
 * overlap window after a new release ships, so this takes the higher of
 * the two, matching what a fresh install actually gets. Shared by Fedora
 * itself and RPM Fusion, an addon repo scoped to the same release number.
 * Pure — no I/O — given an already-fetched release list.
 */
export function resolveCurrentFedoraRelease(releases: BodhiRelease[]): string {
  const current = releases
    .filter((release) => release.id_prefix === "FEDORA" && release.state === "current")
    .map((release) => Number.parseInt(release.version, 10))
    .filter((version) => Number.isFinite(version));

  if (current.length === 0) {
    throw new Error("Bodhi reported no current Fedora release");
  }

  return String(Math.max(...current));
}

export async function fetchCurrentFedoraRelease(): Promise<string> {
  const response = await fetchOrThrow(
    "https://bodhi.fedoraproject.org/releases/?rows_per_page=100",
    "Bodhi releases",
  );
  const { releases } = (await response.json()) as { releases: BodhiRelease[] };
  return resolveCurrentFedoraRelease(releases);
}
