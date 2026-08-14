import type { SourcedPackage } from "../types";
import type { UbuntuCacheEntry } from "./types";

export function normalize(entries: UbuntuCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "ubuntu",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // Ubuntu package names are unique within a suite/component/arch, and
    // match Debian's for packages inherited unchanged from Debian — that's
    // exactly what should let @tuxery/matcher group them, once matching
    // work resumes (see the "Matcher bucket sizes growing again" card).
    appId: entry.name,
    homepage: entry.homepage,
  }));
}
