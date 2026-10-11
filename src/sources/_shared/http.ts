import { gunzipSync, zstdDecompressSync } from "node:zlib";
import { fetchOrThrow as fetchOrThrowHttp, HttpError } from "helpers4/promise";

/**
 * Fetches `url` and throws a consistent, source-labeled error on any
 * non-2xx response — every connector's `fetch.ts` used to repeat this
 * check-and-throw by hand; this is the one place it's implemented now.
 * Not a fit for cases that need to degrade gracefully instead of
 * throwing (e.g. AppImage's per-repo GitHub lookups, where one dead repo
 * shouldn't fail the whole batch) — those stay hand-written.
 */
export async function fetchOrThrow(
  url: string,
  label: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetchOrThrowHttp(url, init);
  } catch (error) {
    // helpers4's HttpError names the URL; the logs read better by source.
    if (!(error instanceof HttpError)) throw error;
    throw new Error(`Failed to fetch ${label}: ${error.status} ${error.statusText}`, {
      cause: error,
    });
  }
}

/**
 * Fetches `url` and returns its body as text — the uncompressed
 * counterpart to `fetchGunzippedText`/`fetchZstdText`, for sources
 * (Slackware, nixpkgs) that publish plain-text repodata.
 */
export async function fetchText(url: string, label: string, init?: RequestInit): Promise<string> {
  const response = await fetchOrThrow(url, label, init);
  return response.text();
}

/**
 * Fetches a gzip-compressed URL and returns the decompressed text —
 * every Debian-family (deb822) and Flatpak-family (AppStream) source
 * publishes its repodata this way. Node's built-in zlib handles the
 * decompression, no new dependency.
 */
export async function fetchGunzippedText(
  url: string,
  label: string,
  init?: RequestInit,
): Promise<string> {
  const response = await fetchOrThrow(url, label, init);
  const compressed = Buffer.from(await response.arrayBuffer());
  return gunzipSync(compressed).toString("utf8");
}

/**
 * Fetches a Zstandard-compressed URL and returns the decompressed text —
 * RPM repodata (Fedora, openSUSE) and Solus's eopkg-index both publish
 * this way. Node 24's built-in zlib handles the decompression, no new
 * dependency.
 */
export async function fetchZstdText(
  url: string,
  label: string,
  init?: RequestInit,
): Promise<string> {
  const response = await fetchOrThrow(url, label, init);
  const compressed = Buffer.from(await response.arrayBuffer());
  return zstdDecompressSync(compressed).toString("utf8");
}
