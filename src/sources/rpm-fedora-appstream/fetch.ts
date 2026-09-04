import { gunzipSync, zstdDecompressSync } from "node:zlib";
import { parseAppstreamXml, type AppstreamComponent } from "../_shared/appstream";
import { fetchCurrentFedoraRelease } from "../_shared/fedora-release";
import { fetchOrThrow } from "../_shared/http";
import { writeMetadata } from "../_shared/metadata";
import { writeNdjson } from "../_shared/ndjson";
import { fetchPrimaryXml } from "../_shared/rpm-repodata";
import type { FedoraAppstreamCacheEntry, FedoraAppstreamFetchMetadata } from "./types";

// Same arch as rpm-fedora — the AppStream component's `pkgname` is a binary
// package name from the same Everything repo the rpm-fedora connector
// indexes, and the exact-appId match tier needs both sides describing the
// same package set.
const ARCH = "x86_64";

function repoBaseFor(release: string): string {
  return `https://dl.fedoraproject.org/pub/fedora/linux/releases/${release}/Everything/${ARCH}/os`;
}

// The RPM container's lead is a fixed 96 bytes (magic + reserved + name/os/
// arch), followed by the signature header, then the main header, then the
// compressed cpio payload. Unlike openSUSE (which publishes appdata.xml.gz
// as a repomd.xml data type), Fedora ships its AppStream metadata *inside*
// the `appstream-data` package — so this connector has to extract an RPM.
// Both headers share one layout: 4-byte magic (8e ad e8 01), 4 bytes
// reserved, 4-byte big-endian entry count, 4-byte big-endian data-store
// size, then `count * 16` bytes of index entries and `size` bytes of data.
const RPM_HEADER_MAGIC = Buffer.from([0x8e, 0xad, 0xe8, 0x01]);

/**
 * Returns the offset just past one RPM header. The next section starts
 * immediately after the header's data store — verified against the real
 * `appstream-data` RPM (whose main header is *not* 8-byte-padded, so an
 * alignment here would overshoot the payload by up to 7 bytes). Pure.
 */
function skipRpmHeader(buffer: Buffer, offset: number): number {
  if (!buffer.subarray(offset, offset + 4).equals(RPM_HEADER_MAGIC)) {
    throw new Error(`RPM header magic not found at offset ${offset}`);
  }
  const entryCount = buffer.readUInt32BE(offset + 8);
  const dataSize = buffer.readUInt32BE(offset + 12);
  return offset + 16 + entryCount * 16 + dataSize;
}

/** Returns the byte offset where the compressed cpio payload starts. Pure — no I/O. */
export function rpmPayloadOffset(buffer: Buffer): number {
  // Lead is a fixed 96 bytes; then the signature header, then the main header.
  return skipRpmHeader(buffer, skipRpmHeader(buffer, 96));
}

// The RPM payload is a compressed cpio archive. Fedora's noarch appstream-data
// uses zstd today; the gzip magic is kept for robustness since the compression
// choice is the package builder's, not a spec guarantee.
function decompressPayload(payload: Buffer, label: string): Buffer {
  if (payload[0] === 0x28 && payload[1] === 0xb5 && payload[2] === 0x2f && payload[3] === 0xfd) {
    return zstdDecompressSync(payload);
  }
  if (payload[0] === 0x1f && payload[1] === 0x8b) {
    return gunzipSync(payload);
  }
  throw new Error(`${label}: unrecognized payload compression`);
}

// cpio "newc" (070701) / "newc CRC" (070702) header layout: 6-byte magic,
// then 13 ASCII-hex 8-byte fields (ino/mode/uid/gid/nlink/mtime/filesize/
// devmajor/devminor/rdevmajor/rdevminor/namesize/check), then the NUL-terminated
// name, 4-byte-aligned, then the file data, 4-byte-aligned.
const CPIO_NAMESIZE_OFFSET = 6 + 11 * 8; // 94
const CPIO_FILESIZE_OFFSET = 6 + 6 * 8; // 54
const CPIO_NAME_OFFSET = 6 + 13 * 8; // 110

/**
 * Extracts the file whose name ends with `suffix` from a newc cpio archive,
 * or `undefined` if no entry matches. Pure — no I/O.
 */
export function readCpioFile(cpio: Buffer, suffix: string): Buffer | undefined {
  let offset = 0;
  while (offset + CPIO_NAME_OFFSET <= cpio.length) {
    const magic = cpio.subarray(offset, offset + 6).toString("ascii");
    if (magic !== "070701" && magic !== "070702") return undefined;
    const nameSize = Number.parseInt(
      cpio
        .subarray(offset + CPIO_NAMESIZE_OFFSET, offset + CPIO_NAMESIZE_OFFSET + 8)
        .toString("ascii"),
      16,
    );
    const fileSize = Number.parseInt(
      cpio
        .subarray(offset + CPIO_FILESIZE_OFFSET, offset + CPIO_FILESIZE_OFFSET + 8)
        .toString("ascii"),
      16,
    );
    const name = cpio
      .subarray(offset + CPIO_NAME_OFFSET, offset + CPIO_NAME_OFFSET + nameSize)
      .toString("utf8")
      .replace(/\0.*/, "");
    const dataStart = (offset + CPIO_NAME_OFFSET + nameSize + 3) & ~3;
    if (name.endsWith(suffix)) return cpio.subarray(dataStart, dataStart + fileSize);
    offset = (dataStart + fileSize + 3) & ~3;
  }
  return undefined;
}

/**
 * Finds the `appstream-data` package's `<location href>` inside Fedora's
 * primary.xml — the one package whose own description is "Fedora AppStream
 * metadata". Pure — no I/O.
 */
export function findAppstreamDataLocation(primaryXml: string): string | undefined {
  return primaryXml.match(/<name>appstream-data<\/name>[\s\S]*?<location href="([^"]+)"/)?.[1];
}

/**
 * Turns a generic AppStream component into the Fedora-specific cache row
 * shape. Keeps only components with a binary package name (`pkgname`),
 * because that's the join key to the rpm-fedora source.
 */
export function toCacheEntries(components: AppstreamComponent[]): FedoraAppstreamCacheEntry[] {
  return components
    .filter((component) => component.pkgname)
    .map((component) => ({
      id: component.id,
      pkgname: component.pkgname as string,
      source_pkgname: component.source_pkgname,
      name: component.name,
      summary: component.summary,
      version: component.version,
      iconFilename: component.iconFilename,
      remoteIconUrl: component.remoteIconUrl,
      homepage: component.homepage,
      hasGameCategory: component.hasGameCategory,
      categories: component.categories,
      license: component.license,
      developer: component.developer,
      longDescription: component.longDescription,
      screenshots: component.screenshots,
      languages: component.languages,
      changelog: component.changelog,
      lastUpdated: component.lastUpdated,
    }));
}

/**
 * Downloads Fedora's `appstream-data` RPM, extracts its `fedora.xml.gz`
 * (RPM container -> compressed cpio -> gzipped AppStream XML), and returns
 * the decompressed XML text. Fedora ships AppStream data this way rather
 * than as a repomd.xml data type (unlike openSUSE's appdata.xml.gz).
 */
async function fetchFedoraXml(release: string): Promise<string> {
  const repoBase = repoBaseFor(release);
  const primaryXml = await fetchPrimaryXml(repoBase, "Fedora");
  const rpmLocation = findAppstreamDataLocation(primaryXml);
  if (!rpmLocation) {
    throw new Error(`Fedora primary.xml at ${repoBase} has no appstream-data package`);
  }

  const rpmUrl = `${repoBase}/${rpmLocation}`;
  const response = await fetchOrThrow(rpmUrl, "Fedora appstream-data RPM");
  const rpm = Buffer.from(await response.arrayBuffer());
  const cpio = decompressPayload(rpm.subarray(rpmPayloadOffset(rpm)), "Fedora appstream-data RPM");
  const fedoraXmlGz = readCpioFile(cpio, "fedora.xml.gz");
  if (!fedoraXmlGz) {
    throw new Error("Fedora appstream-data RPM has no fedora.xml.gz entry");
  }
  return gunzipSync(fedoraXmlGz).toString("utf8");
}

/**
 * Downloads Fedora's AppStream metadata for the current release (resolved
 * live via Bodhi — see `fetchCurrentFedoraRelease`) and writes the parsed
 * components to `cachePath` as NDJSON. See docs/sources.md.
 */
export async function fetchFedoraAppstream(cachePath: string): Promise<number> {
  const release = await fetchCurrentFedoraRelease();
  const xml = await fetchFedoraXml(release);
  const entries = toCacheEntries(parseAppstreamXml(xml));

  writeNdjson(cachePath, entries);
  writeMetadata<FedoraAppstreamFetchMetadata>(cachePath, {
    source: "rpm-fedora-appstream",
    fetchedAt: new Date().toISOString(),
    url: repoBaseFor(release),
    entryCount: entries.length,
    release,
  });

  return entries.length;
}
