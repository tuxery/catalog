import { max } from "helpers4/array";
import { fetchOrThrow, isNotFound } from "./http";

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
  return String(max(resolveCurrentFedoraReleases(releases).map(Number)));
}

/** Every release Bodhi marks current, newest first (usually one, two around a release). Pure. */
export function resolveCurrentFedoraReleases(releases: BodhiRelease[]): string[] {
  const current = releases
    .filter((release) => release.id_prefix === "FEDORA" && release.state === "current")
    .map((release) => Number.parseInt(release.version, 10))
    .filter((version) => Number.isFinite(version));

  if (current.length === 0) {
    throw new Error("Bodhi reported no current Fedora release");
  }

  return current.toSorted((a, b) => b - a).map(String);
}

async function fetchCurrentFedoraReleases(): Promise<string[]> {
  const response = await fetchOrThrow(
    "https://bodhi.fedoraproject.org/releases/?rows_per_page=100",
    "Bodhi releases",
  );
  const { releases } = (await response.json()) as { releases: BodhiRelease[] };
  return resolveCurrentFedoraReleases(releases);
}

/**
 * Runs `fetchFor` on the newest current Fedora release, falling back to the
 * next one when its repositories answer 404. Bodhi can mark a release
 * current before the archive publishes it: on 2026-10-31 it said 45 while
 * `releases/45/` didn't exist yet, and Fedora, its AppStream and RPM Fusion
 * all failed that week. The release used is returned next to the result.
 */
export async function withCurrentFedoraRelease<T>(
  fetchFor: (release: string) => Promise<T>,
  releases?: string[],
): Promise<{ release: string; result: T }> {
  const candidates = releases ?? (await fetchCurrentFedoraReleases());
  for (const [index, release] of candidates.entries()) {
    try {
      // Sequential on purpose: the next release is only tried after a 404.
      // eslint-disable-next-line no-await-in-loop
      return { release, result: await fetchFor(release) };
    } catch (error) {
      const next = candidates[index + 1];
      if (!next || !isNotFound(error)) throw error;
      console.warn(`Fedora ${release} isn't published yet (404): using ${next}.`);
    }
  }
  throw new Error("No current Fedora release to fetch");
}
