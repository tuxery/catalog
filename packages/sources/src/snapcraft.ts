import type { SourcedPackage } from "./types";

/**
 * Searches Snapcraft for packages matching `query`.
 *
 * Stub: not wired to the real Snapcraft API yet (see the "Snapcraft
 * connector" card on the Tuxery GitHub Project). Returns an empty list so
 * callers and tests can already depend on the real function signature.
 */
export async function searchSnapcraft(query: string): Promise<SourcedPackage[]> {
  void query;
  return [];
}
