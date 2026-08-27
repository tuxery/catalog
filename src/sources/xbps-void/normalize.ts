import type { SourcedPackage } from "../types";
import type { VoidCacheEntry } from "./types";

/**
 * `pkgver` is always `<pkgname>-<version>_<revision>` by xbps convention
 * (e.g. `0ad-0.27.1_6` for package `0ad`) — the pkgname prefix is
 * guaranteed present, so a plain slice recovers the version.
 */
function extractVersion(name: string, pkgver: string): string {
  return pkgver.startsWith(`${name}-`) ? pkgver.slice(name.length + 1) : pkgver;
}

export function normalize(entries: VoidCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "xbps-void",
    name: entry.name,
    description: entry.short_desc,
    version: extractVersion(entry.name, entry.pkgver),
    // Void/xbps package names are unique within a repo/arch, and across
    // main + nonfree + multilib too — see fetch.ts.
    appId: entry.name,
    homepage: entry.homepage,
  }));
}
