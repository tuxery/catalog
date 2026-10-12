import { fetchOrThrow } from "../_shared/http";
import { percentileScores } from "../_shared/popularity";

const PKGSTATS_URL = "https://pkgstats.archlinux.de/api/packages";
// The API serves up to 10,000 packages per page (40,000 is rejected).
const PAGE_SIZE = 10_000;

interface RawPackagePopularities {
  total?: number;
  packagePopularities?: { name?: string; count?: number }[];
}

/** pkgstats' per-package user counts, by package name. Pure — no I/O. */
export function parsePkgstats(page: RawPackagePopularities): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { name, count } of page.packagePopularities ?? []) {
    if (name && count) counts.set(name, count);
  }
  return counts;
}

async function fetchPage(offset: number): Promise<RawPackagePopularities> {
  const response = await fetchOrThrow(
    `${PKGSTATS_URL}?limit=${PAGE_SIZE}&offset=${offset}`,
    "Arch pkgstats",
  );
  return (await response.json()) as RawPackagePopularities;
}

/** Every package's pkgstats percentile score (1 = most installed), see `percentileScores`. */
export async function fetchPkgstatsScores(): Promise<Map<string, number>> {
  const first = await fetchPage(0);
  const offsets = Array.from(
    { length: Math.ceil((first.total ?? 0) / PAGE_SIZE) - 1 },
    (_, page) => (page + 1) * PAGE_SIZE,
  );
  const pages = [first, ...(await Promise.all(offsets.map(fetchPage)))];
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const [name, count] of parsePkgstats(page)) counts.set(name, count);
  }
  return percentileScores(counts);
}
