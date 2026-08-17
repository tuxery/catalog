import type { SourcedPackage } from "../types";
import type { FedoraCacheEntry } from "./types";

export function normalize(entries: FedoraCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "rpm-fedora",
    name: entry.name,
    description: entry.summary,
    version: entry.version,
    // Fedora/RPM package names are unique within a release/repo/arch.
    appId: entry.name,
    homepage: entry.homepage,
    hasDesktopFile: entry.hasDesktopFile,
  }));
}
