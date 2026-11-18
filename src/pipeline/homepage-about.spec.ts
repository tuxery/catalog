import { describe, expect, it } from "vitest";
import {
  aboutFromHtml,
  aboutFromReadme,
  dropSharedDescriptions,
  fetchHomepageAbout,
  fetchOneHomepageAbout,
  githubRepoOf,
  MAX_ABOUT_LENGTH,
  saysMoreThanName,
  type Fetcher,
} from "./homepage-about";

describe("githubRepoOf", () => {
  it("reads owner/repo from a repository's page", () => {
    expect(githubRepoOf("https://github.com/DylanDDeng/Aegis")).toBe("dylanddeng/aegis");
    expect(githubRepoOf("https://www.github.com/a/b.git/tree/main")).toBe("a/b");
  });

  it("is undefined for anything else", () => {
    expect(githubRepoOf("https://github.com/someone")).toBeUndefined();
    expect(githubRepoOf("https://gitlab.com/a/b")).toBeUndefined();
    expect(githubRepoOf("not a url")).toBeUndefined();
  });
});

describe("aboutFromHtml", () => {
  it("joins the title and the meta description, entities decoded", () => {
    const html = `<html><head><title>SWC-DB &amp; friends</title>
      <meta name="description" content="A high-performance &quot;wide column&quot; database"></head></html>`;
    expect(aboutFromHtml(html)).toBe(
      'SWC-DB & friends — A high-performance "wide column" database',
    );
  });

  it("prefers og:title, takes og:description when there is no description, in any attribute order", () => {
    const html = `<meta content="Grid logic puzzles" property="og:description"><meta property="og:title" content="Griddle"><title>Home</title>`;
    expect(aboutFromHtml(html)).toBe("Griddle — Grid logic puzzles");
  });

  it("doesn't repeat a title the description starts with", () => {
    const html = `<title>Kopia</title><meta name="description" content="Kopia is a fast backup tool">`;
    expect(aboutFromHtml(html)).toBe("Kopia is a fast backup tool");
  });

  it("is undefined for a page that says nothing, and cuts a long one", () => {
    expect(aboutFromHtml("<html><body>hi</body></html>")).toBeUndefined();
    const long = `<meta name="description" content="${"word ".repeat(200)}">`;
    expect(aboutFromHtml(long)?.length).toBeLessThanOrEqual(MAX_ABOUT_LENGTH);
  });
});

describe("aboutFromReadme", () => {
  it("keeps the opening prose, without headings, badges, images, HTML or link targets", () => {
    const readme = [
      "# Aegis",
      "",
      "[![build](https://x/badge.svg)](https://x) ![logo](logo.png)",
      '<p align="center"><img src="shot.png"></p>',
      "",
      "Aegis is a **desktop** [2FA](https://en.wikipedia.org/wiki/2FA) code manager for Linux.",
      "",
      "```sh",
      "make install",
      "```",
      "",
      "It syncs with your phone.",
    ].join("\n");
    expect(aboutFromReadme(readme)).toBe(
      "Aegis is a desktop 2FA code manager for Linux. It syncs with your phone.",
    );
  });

  it("skips what a project template wrote", () => {
    expect(
      aboutFromReadme(
        "This template should help get you started developing with Tauri in vanilla HTML.\n\nA tiny racing game made for a game jam.",
      ),
    ).toBe("A tiny racing game made for a game jam.");
  });

  it("is undefined for a README of headings and badges only", () => {
    expect(aboutFromReadme("# Title\n\n[![x](y)](z)\n")).toBeUndefined();
  });
});

const response = (body: string, status = 200) => new Response(body, { status });
const titlePage: Fetcher = async () => response("<title>Zim - a desktop wiki</title>");
const unreachable: Fetcher = async () => {
  throw new Error("ENOTFOUND");
};

describe("fetchOneHomepageAbout", () => {
  it("reads a GitHub repository's README through the API, with the token", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher: Fetcher = async (url, init) => {
      calls.push({ url, init });
      return response("A small tool that converts subtitles between formats quickly.");
    };
    const row = await fetchOneHomepageAbout("https://github.com/a/b", fetcher, "tok");
    expect(calls[0]?.url).toBe("https://api.github.com/repos/a/b/readme");
    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(row).toEqual({
      url: "https://github.com/a/b",
      text: "A small tool that converts subtitles between formats quickly.",
    });
  });

  it("reads another homepage's title and description", async () => {
    expect(await fetchOneHomepageAbout("https://zim-wiki.org", titlePage)).toEqual({
      url: "https://zim-wiki.org",
      text: "Zim - a desktop wiki",
    });
  });

  it("records a failed or unreachable page so it isn't asked again", async () => {
    expect(await fetchOneHomepageAbout("https://x.org", async () => response("", 404))).toEqual({
      url: "https://x.org",
      status: 404,
    });
    expect(await fetchOneHomepageAbout("https://x.org", unreachable)).toEqual({
      url: "https://x.org",
      status: 0,
    });
  });
});

describe("fetchHomepageAbout", () => {
  it("fetches every URL in turn, pausing between them", async () => {
    const seen: string[] = [];
    const pauses: number[] = [];
    const rows = await fetchHomepageAbout(
      ["https://a.org", "https://b.org"],
      async (url) => {
        seen.push(url);
        return new Response("<title>Page</title>");
      },
      async (ms) => pauses.push(ms),
    );
    expect(seen).toEqual(["https://a.org", "https://b.org"]);
    expect(pauses).toHaveLength(2);
    expect(rows.map((row) => row.text)).toEqual(["Page", "Page"]);
  });
});

describe("dropSharedDescriptions", () => {
  it("keeps only the title where pages with different titles share a description", () => {
    const rows = dropSharedDescriptions([
      { url: "a", text: "Septerra Core — Play all your games on Linux." },
      { url: "b", text: "Crunch Time! — Play all your games on Linux." },
      { url: "c", text: "SWC-DB — A scalable database" },
      { url: "d", text: "SWC-DB — A scalable database" },
      { url: "e", status: 404 },
    ]);
    expect(rows.map((row) => row.text)).toEqual([
      "Septerra Core",
      "Crunch Time!",
      "SWC-DB — A scalable database",
      "SWC-DB — A scalable database",
      undefined,
    ]);
  });
});

describe("saysMoreThanName", () => {
  it("needs three words besides the name and the code host", () => {
    expect(saysMoreThanName("slonkazoid / avt · GitLab", "avt")).toBe(false);
    expect(saysMoreThanName("Septerra Core", "Septerra Core")).toBe(false);
    expect(saysMoreThanName("H S / apush · GitLab — A Potentially Useful SHell", "apush")).toBe(
      true,
    );
  });
});
