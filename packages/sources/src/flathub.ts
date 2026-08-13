import type { SourcedPackage } from "./types";

/**
 * Searches Flathub for packages matching `query`.
 *
 * Stub: not wired to the real Flathub API yet (see the "Flathub connector"
 * card on the Tuxery GitHub Project). Returns an empty list so callers and
 * tests can already depend on the real function signature.
 */
export async function searchFlathub(query: string): Promise<SourcedPackage[]> {
  void query;
  return [];
}
