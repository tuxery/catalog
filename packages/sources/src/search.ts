import { searchAppImage } from "./appimage";
import { searchAur } from "./aur";
import { searchDebian } from "./debian";
import { searchFlathub } from "./flathub";
import { searchSnapcraft } from "./snapcraft";
import type { SourcedPackage } from "./types";

/**
 * Queries every known source in parallel and returns the combined,
 * un-deduplicated results — pass this to `@tuxery/matcher`'s
 * `groupPackages` to get one unified app per result.
 */
export async function searchAllSources(query: string): Promise<SourcedPackage[]> {
  const results = await Promise.all([
    searchFlathub(query),
    searchSnapcraft(query),
    searchAppImage(query),
    searchAur(query),
    searchDebian(query),
  ]);

  return results.flat();
}
