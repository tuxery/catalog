import type { SourcedPackage } from "./types";

/**
 * Searches known AppImage source feeds for packages matching `query`.
 *
 * Stub: not wired to a real AppImage source yet (see the "AppImage
 * connector" card on the Tuxery GitHub Project). Returns an empty list so
 * callers and tests can already depend on the real function signature.
 */
export async function searchAppImage(query: string): Promise<SourcedPackage[]> {
  void query;
  return [];
}
