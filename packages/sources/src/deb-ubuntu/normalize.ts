import type { SourcedPackage } from "../types";
import type { UbuntuCacheEntry } from "./types";

/** Strips the `<component>/` prefix non-main components' Section values carry (e.g. "universe/games" -> "games"), so it's comparable to Debian's bare value. */
function normalizeSection(section: string | undefined): string | undefined {
  return section?.includes("/") ? section.slice(section.indexOf("/") + 1) : section;
}

export function normalize(entries: UbuntuCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "deb-ubuntu",
    name: entry.name,
    description: entry.description,
    version: entry.version,
    // Ubuntu package names are unique within a suite/component/arch, and
    // match Debian's for packages inherited unchanged from Debian — that's
    // exactly what should let @tuxery/curator group them, once matching
    // work resumes (see the "Matcher bucket sizes growing again" card).
    appId: entry.name,
    homepage: entry.homepage,
    section: normalizeSection(entry.section),
    // entry.component (main/universe) isn't threaded through yet —
    // SourcedPackage has no slot for it. See the "Thread arch/channel
    // into SourcedPackage consistently" card; it stays available in the
    // cache row either way.
  }));
}
