import { nameAxes } from "../_shared/name-axes";
import type { SourcedPackage } from "../types";

// AppImage names are display names with `_` or spaces between words
// (`Thunderbird_Beta`, `Firefox_ESR`, `OpenComic_Nightly`): read their
// trailing risk words like an AUR name's, plus the two track words.
const TRACK_WORDS = new Set(["esr", "lts"]);

/** The track and risk an AppImage's display name ends with. Pure. */
export function appImageAxes(name: string): Pick<SourcedPackage, "track" | "risk"> {
  const dashed = name.toLowerCase().replaceAll(/[\s_]+/g, "-");
  const last = dashed.split("-").at(-1) ?? "";
  if (dashed.includes("-") && TRACK_WORDS.has(last)) return { track: last };
  const { risk } = nameAxes(dashed);
  return risk ? { risk } : {};
}
import type { AppImageCacheEntry } from "./types";

export function normalize(entries: AppImageCacheEntry[]): SourcedPackage[] {
  return entries.map((entry) => ({
    source: "appimage",
    name: entry.name,
    description: entry.description,
    version: entry.version ?? "unknown",
    appId: entry.repo,
    ...appImageAxes(entry.name),
    iconFilename: entry.iconFilename,
    homepage: entry.homepage,
  }));
}
