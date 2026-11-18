import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readNdjson, writeNdjson } from "../sources/_shared/ndjson";

/**
 * What an app's homepage says it is: the page's title and meta
 * description, or, for a GitHub repository, the opening of its README.
 * Owner-written text, so it is never committed to this public repository:
 * `classify-llm --homepage-about` fetches it on demand into a gitignored
 * local file (`HOMEPAGE_ABOUT_PATH`) and only the resulting verdicts, in
 * the model's own few words, are committed. Same discipline as
 * `github-stars/about.ts`, whose repository description and topics are
 * often empty where a README isn't.
 */
export interface HomepageAbout {
  /** The homepage URL as the dataset spells it. */
  url: string;
  /** Title and description, or the README's opening, cut to `MAX_ABOUT_LENGTH`. Absent when the page said nothing usable. */
  text?: string;
  /** The HTTP status when it wasn't a success, so the page isn't asked again. */
  status?: number;
}

/** Where `classify-llm --homepage-about` keeps what it fetched: gitignored (`.cache/`), never published. */
export const HOMEPAGE_ABOUT_PATH = fileURLToPath(
  new URL("../../.cache/homepage-about.ndjson", import.meta.url),
);

/** More than a store's one-liner, less than the prompt's line budget. */
export const MAX_ABOUT_LENGTH = 300;

/** Pages past this size are cut: the title and meta tags sit in the `<head>`. */
const MAX_PAGE_BYTES = 256 * 1024;
const TIMEOUT_MS = 10_000;
/** A generic client name: nothing about who runs the catalog. */
const USER_AGENT = "Mozilla/5.0 (compatible; catalog-classifier)";
/** Between two requests: one page per project, at a polite pace. */
const PAUSE_MS = 300;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text.replaceAll(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

function clean(text: string): string {
  return decodeEntities(text).replaceAll(/\s+/g, " ").trim();
}

function cut(text: string): string | undefined {
  const cleaned = clean(text);
  if (!cleaned) return undefined;
  return cleaned.length > MAX_ABOUT_LENGTH
    ? `${cleaned.slice(0, MAX_ABOUT_LENGTH - 1).trimEnd()}…`
    : cleaned;
}

/** `owner/repo` (lowercased) when `url` is a GitHub repository's page, else `undefined`. Pure. */
export function githubRepoOf(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.hostname.toLowerCase().replace(/^www\./, "") !== "github.com") return undefined;
  const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
  if (!owner || !repo) return undefined;
  return `${owner}/${repo.replace(/\.git$/, "")}`.toLowerCase();
}

function metaContent(html: string, names: readonly string[]): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\b(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (!name || !names.includes(name)) continue;
    const content = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag);
    const value = content?.[1] ?? content?.[2];
    if (value?.trim()) return value;
  }
  return undefined;
}

/** A page's title and meta description, joined, cut to `MAX_ABOUT_LENGTH`. Pure. */
export function aboutFromHtml(html: string): string | undefined {
  const head = html.slice(0, MAX_PAGE_BYTES);
  const title =
    metaContent(head, ["og:title"]) ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "";
  const description =
    metaContent(head, ["description", "og:description", "twitter:description"]) ?? "";
  const parts = [clean(title), clean(description)].filter(Boolean);
  if (parts.length === 2 && parts[1]?.toLowerCase().startsWith(parts[0]?.toLowerCase() ?? "")) {
    parts.shift();
  }
  return cut(parts.join(" — "));
}

/** A README paragraph a project template wrote, not its author: it says nothing about the app. */
const TEMPLATE_README =
  /\bthis (template|project) (should help|was (generated|bootstrapped|created) (with|using|by))\b/i;

/**
 * The opening prose of a README: its first paragraphs once headings,
 * badges, images, HTML tags, code blocks and link targets are dropped,
 * cut to `MAX_ABOUT_LENGTH`. Pure.
 */
export function aboutFromReadme(markdown: string): string | undefined {
  const text = markdown
    .replaceAll(/```[\s\S]*?```/g, "\n\n")
    .replaceAll(/<!--[\s\S]*?-->/g, "")
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replaceAll(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replaceAll(/<img\b[^>]*>/gi, "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => !/^\s*(#|=+\s*$|-+\s*$|\||>?\s*\[!)/.test(line))
        .join(" "),
    )
    .map((block) => clean(block.replaceAll(/[*_`]+/g, "")))
    .filter((block) => block.length >= 20 && !TEMPLATE_README.test(block));
  return cut(paragraphs.slice(0, 2).join(" "));
}

/** What `aboutFromHtml` puts between a page's title and its description. */
const TITLE_SEPARATOR = " — ";

/** A row's title and description, when it has both. */
function splitTitle(text: string): { title: string; description: string } | undefined {
  const at = text.indexOf(TITLE_SEPARATOR);
  return at < 0
    ? undefined
    : { title: text.slice(0, at), description: text.slice(at + TITLE_SEPARATOR.length) };
}

/**
 * `rows` with each site-wide description dropped: one that two pages with
 * different titles share is the site's, not the app's (Lutris's "Play all
 * your games on Linux", GitLab's "GitLab.com"), so only the title is left.
 * Pure.
 */
export function dropSharedDescriptions(rows: readonly HomepageAbout[]): HomepageAbout[] {
  const titlesByDescription = new Map<string, Set<string>>();

  for (const row of rows) {
    const parts = row.text ? splitTitle(row.text) : undefined;
    if (!parts) continue;
    const titles = titlesByDescription.get(parts.description) ?? new Set<string>();
    titles.add(parts.title);
    titlesByDescription.set(parts.description, titles);
  }
  return rows.map((row) => {
    const parts = row.text ? splitTitle(row.text) : undefined;
    if (!parts || (titlesByDescription.get(parts.description)?.size ?? 0) < 2) return row;
    return { ...row, text: parts.title };
  });
}

/** Code-hosting words a page title adds around a project's name. */
const HOSTING_WORDS = new Set([
  "github",
  "gitlab",
  "gitea",
  "codeberg",
  "sourcehut",
  "sourceforge",
  "git",
  "com",
  "net",
  "org",
  "browse",
  "files",
  "at",
  "home",
  "page",
  "homepage",
  "official",
  "website",
  "site",
]);

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Whether `text` says something beyond the app's own name and its code
 * host: at least three other words. A page whose title is only
 * "owner / name · GitLab" gives the model nothing but a name it already
 * had, and it then guesses. Pure.
 */
export function saysMoreThanName(text: string, name: string): boolean {
  const nameWords = new Set(words(name.replaceAll(/[-_.]+/g, " ")));
  return words(text).filter((word) => !nameWords.has(word) && !HOSTING_WORDS.has(word)).length >= 3;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_PAGE_BYTES) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_PAGE_BYTES));
}

/** One homepage's row: its README's opening for a GitHub repository, else its title and description. */
export async function fetchOneHomepageAbout(
  url: string,
  fetcher: Fetcher = fetch,
  githubToken: string | undefined = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
): Promise<HomepageAbout> {
  const repo = githubRepoOf(url);
  const target = repo ? `https://api.github.com/repos/${repo}/readme` : url;
  const headers: Record<string, string> = repo
    ? {
        Accept: "application/vnd.github.raw",
        ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
      }
    : { "User-Agent": USER_AGENT, Accept: "text/html" };
  try {
    const response = await fetcher(target, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { url, status: response.status };
    const body = await readCapped(response);
    const text = repo ? aboutFromReadme(body) : aboutFromHtml(body);
    return text ? { url, text } : { url };
  } catch {
    // Unreachable, timed out, refused: nothing to say, and not asked again.
    return { url, status: 0 };
  }
}

/** Fetches `urls` one at a time, `PAUSE_MS` apart. */
export async function fetchHomepageAbout(
  urls: readonly string[],
  fetcher: Fetcher = fetch,
  pause: (ms: number) => Promise<unknown> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<HomepageAbout[]> {
  const rows: HomepageAbout[] = [];
  for (const url of urls) {
    // One page per project, sequentially: no host is hit twice in a row.
    // eslint-disable-next-line no-await-in-loop
    rows.push(await fetchOneHomepageAbout(url, fetcher));
    // eslint-disable-next-line no-await-in-loop
    await pause(PAUSE_MS);
  }
  return rows;
}

/** The fetched rows, keyed by URL (empty when nothing was fetched yet). */
export function readHomepageAbout(path: string = HOMEPAGE_ABOUT_PATH): Map<string, HomepageAbout> {
  return new Map(readNdjson<HomepageAbout>(path).map((row) => [row.url, row]));
}

/** Writes `rows`, sorted by URL, to the local file. */
export function writeHomepageAbout(
  rows: Iterable<HomepageAbout>,
  path: string = HOMEPAGE_ABOUT_PATH,
): void {
  const sorted = [...rows].toSorted((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  mkdirSync(dirname(path), { recursive: true });
  writeNdjson(path, sorted);
}
