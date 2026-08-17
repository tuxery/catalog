import { fetchText } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import type { SlackwareCacheEntry, SlackwareFetchMetadata } from "./types";

// Slackware's official mirror-selection redirector — Node's fetch follows
// its 302 to a geographically-chosen mirror transparently, same as
// openSUSE's download.opensuse.org. A single plain-text file, no
// per-arch/per-repo split, no compression at all (unlike every other
// native source here) — Slackware doesn't split -dev/-doc subpackages out
// the way Debian/Fedora do either, so its own naming convention gives the
// existing name-pattern filter far less to catch; its "series" component
// (below) is a real signal where the name alone isn't.
const URL = "https://mirrors.slackware.com/slackware/slackware64-current/PACKAGES.TXT";

/**
 * Splits a Slackware package filename into name and version. Format is
 * `<name>-<version>-<arch>-<build>.txz` — name itself can contain hyphens
 * (e.g. `gcc-gdc`), so this always takes the last three hyphen-separated
 * segments as version/arch/build, keeping everything before that as the
 * name (a greedy regex match handles this correctly by construction).
 * Pure — no I/O.
 */
export function splitPackageFilename(fileName: string): { name: string; version: string } {
  const match = fileName.match(/^(.+)-([^-]+)-([^-]+)-([^-]+)\.txz$/);
  if (!match) return { name: fileName, version: "unknown" };
  const [, name, version, , build] = match;
  return { name: name ?? fileName, version: `${version}-${build}` };
}

/**
 * Parses `PACKAGES.TXT`'s blocks (blank-line separated, `KEY:  value`
 * header lines followed by a `PACKAGE DESCRIPTION:` section whose lines
 * are each prefixed `<name>: `) into cache rows. The first description
 * line is the short summary (Slackware's convention is
 * `<name>: <name> (<short description>)`); a `Homepage:` line, when
 * present, is pulled out separately — not every package has one, some
 * instead bury a URL in free-form prose (e.g. "For information, see:
 * ..."), left unextracted rather than guessed at. Pure — no I/O.
 */
export function parsePackagesTxt(text: string): SlackwareCacheEntry[] {
  const blocks = text.split(/\r?\n\r?\n+/).filter((block) => block.includes("PACKAGE NAME:"));

  return blocks.flatMap((block) => {
    const fileName = block.match(/^PACKAGE NAME:\s*(.+)$/m)?.[1]?.trim();
    const location = block.match(/^PACKAGE LOCATION:\s*(.+)$/m)?.[1]?.trim();
    if (!fileName || !location) return [];

    const { name, version } = splitPackageFilename(fileName);
    const series = location.split("/").pop() ?? "";

    const descriptionLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith(`${name}:`))
      .map((line) => line.slice(name.length + 1).trim());
    const summary = descriptionLines[0] ?? "";
    const homepageLine = descriptionLines.find((line) => line.startsWith("Homepage:"));
    const homepage = homepageLine?.slice("Homepage:".length).trim() || undefined;

    return [{ name, version, summary, homepage, series }];
  });
}

/**
 * Downloads Slackware's `PACKAGES.TXT` and writes the parsed entries to
 * `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchSlackware(cachePath: string): Promise<number> {
  const text = await fetchText(URL, "Slackware PACKAGES.TXT");
  const entries = parsePackagesTxt(text);

  writeNdjson(cachePath, entries);
  writeMetadata<SlackwareFetchMetadata>(cachePath, {
    source: "slackware",
    fetchedAt: new Date().toISOString(),
    url: URL,
    entryCount: entries.length,
  });

  return entries.length;
}
