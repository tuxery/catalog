import { gunzipSync, zstdDecompressSync } from "node:zlib";
import { fetchOrThrow as fetchOrThrowHttp, HttpError } from "helpers4/promise";

/** Who is asking, so a source's operators can recognise this traffic and reach us. */
export const USER_AGENT = "tuxery-catalog (+https://github.com/tuxery/catalog)";

/** `init` with our User-Agent, unless it already sets one (AppImageHub's agreed one, say). */
export function withUserAgent(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
  return { ...init, headers };
}

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
    return await fetchOrThrowHttp(url, withUserAgent(init));
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

/** The HTTP status of a failed fetch, from `fetchOrThrow`'s error or its `HttpError` cause. */
function statusOf(error: unknown): number | undefined {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    if (current instanceof HttpError) return current.status;
    if (!(current instanceof Error)) return undefined;
  }
  return undefined;
}

/** Whether a fetch failed with a 404: the resource isn't (or isn't yet) published. */
export function isNotFound(error: unknown): boolean {
  return statusOf(error) === 404;
}

const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/**
 * Whether a failed refresh is worth trying again: a network error that
 * usually clears up (a reset connection, a timeout, a DNS hiccup) or a
 * 5xx from the server, anywhere in the error's `cause` chain. Never a 4xx,
 * an expired certificate or a parse error: those fail the same way twice.
 */
export function isTransient(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) return status >= 500;
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;
    if (!(current instanceof Error)) break;
  }
  return false;
}
