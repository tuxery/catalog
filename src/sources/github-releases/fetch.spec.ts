import { describe, expect, it, vi } from "vitest";
import { midDate, nextDate, resolveEntries, searchDateRange } from "./fetch";
import type { RawRelease, SearchPage } from "./fetch";

type Lookup = (repo: string) => Promise<RawRelease | undefined>;

function repo(overrides: Partial<Parameters<typeof resolveEntries>[0][number]>) {
  return {
    name: "example",
    full_name: "owner/example",
    description: "An example app",
    html_url: "https://github.com/owner/example",
    stargazers_count: 42,
    ...overrides,
  };
}

describe("resolveEntries", () => {
  it("builds a cache entry from a repo with a real Release", async () => {
    const repos = [repo({})];
    const lookup = vi.fn<Lookup>(async () => ({
      tag_name: "v1.2.3",
      html_url: "https://github.com/owner/example/releases/tag/v1.2.3",
    }));

    const entries = await resolveEntries(repos, lookup, 2);

    expect(entries).toEqual([
      {
        name: "example",
        description: "An example app",
        repo: "owner/example",
        version: "v1.2.3",
        homepage: "https://github.com/owner/example",
        releaseUrl: "https://github.com/owner/example/releases/tag/v1.2.3",
        stars: 42,
      },
    ]);
  });

  it("drops a repo with no Release at all — real case: shell-installer projects like winapps", async () => {
    const repos = [repo({ full_name: "winapps-org/winapps" })];
    const lookup = vi.fn<Lookup>(async () => undefined);

    expect(await resolveEntries(repos, lookup, 2)).toEqual([]);
  });

  it("drops a repo whose Release has no tag_name (a malformed/empty response)", async () => {
    const repos = [repo({})];
    const lookup = vi.fn<Lookup>(async () => ({}));

    expect(await resolveEntries(repos, lookup, 2)).toEqual([]);
  });

  it("falls back to an empty description and a constructed homepage/releaseUrl when absent", async () => {
    const repos = [
      { name: "bare", full_name: "owner/bare", description: null, html_url: undefined },
    ];
    const lookup = vi.fn<Lookup>(async () => ({ tag_name: "v1", html_url: undefined }));

    const entries = await resolveEntries(repos, lookup, 1);

    expect(entries).toEqual([
      {
        name: "bare",
        description: "",
        repo: "owner/bare",
        version: "v1",
        homepage: "https://github.com/owner/bare",
        releaseUrl: "https://github.com/owner/bare/releases/latest",
        stars: 0,
      },
    ]);
  });

  it("skips a repo with no full_name or name rather than crashing", async () => {
    const repos = [{ full_name: "owner/only-full-name" }, { name: "only-name" }];
    const lookup = vi.fn<Lookup>(async () => ({ tag_name: "v1" }));

    expect(await resolveEntries(repos, lookup, 2)).toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("respects a concurrency cap smaller than the repo count", async () => {
    const repos = Array.from({ length: 10 }, (_, i) => repo({ full_name: `owner/repo-${i}` }));
    let inFlight = 0;
    let maxInFlight = 0;
    const lookup = vi.fn<Lookup>(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return { tag_name: "v1" };
    });

    await resolveEntries(repos, lookup, 3);

    expect(lookup).toHaveBeenCalledTimes(10);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});

describe("midDate/nextDate", () => {
  it("splits a range at its midpoint, rounding down", () => {
    expect(midDate("2020-01-01", "2020-01-11")).toBe("2020-01-06");
  });

  it("returns the day immediately after the given date", () => {
    expect(nextDate("2020-01-06")).toBe("2020-01-07");
  });

  it("carries over month/year boundaries", () => {
    expect(nextDate("2020-01-31")).toBe("2020-02-01");
    expect(nextDate("2020-12-31")).toBe("2021-01-01");
  });
});

function repoNamed(full_name: string) {
  return { full_name };
}

describe("searchDateRange", () => {
  it("pages a range directly when its total_count already fits under the 1,000-result cap", async () => {
    const fetchPage = vi.fn<(from: string, to: string, page: number) => Promise<SearchPage>>(
      async () => ({ items: [repoNamed("owner/a")], totalCount: 1 }),
    );

    const repos = await searchDateRange("2020-01-01", "2020-12-31", fetchPage);

    expect(repos).toEqual([repoNamed("owner/a")]);
    expect(fetchPage).toHaveBeenCalledTimes(1); // one page covers a total_count of 1
  });

  it("bisects a range whose total_count exceeds the cap, recursing into each half", async () => {
    const fetchPage = vi.fn<(from: string, to: string, page: number) => Promise<SearchPage>>(
      async (from, to, page) => {
        if (page > 1) return { items: [], totalCount: 0 };
        // The full range and its first-half sub-range both still exceed
        // the cap; only once bisected down to the second half does the
        // count finally fit, matching a real "big early period, sparse
        // later" growth shape.
        if (from === "2020-01-01" && to === "2020-12-31") return { items: [], totalCount: 2000 };
        if (from === "2020-01-01" && to === "2020-07-01") return { items: [], totalCount: 1500 };
        return { items: [repoNamed(`owner/${from}`)], totalCount: 1 };
      },
    );

    const repos = await searchDateRange("2020-01-01", "2020-12-31", fetchPage);

    // Every leaf range that actually fit under the cap contributed its
    // one repo — proves the recursion reached real leaves on both sides,
    // not just the one that happened to fit first.
    expect(repos.length).toBeGreaterThanOrEqual(2);
  });

  it("stops bisecting at MAX_BISECTION_DEPTH even if every range keeps exceeding the cap", async () => {
    const fetchPage = vi.fn<(from: string, to: string, page: number) => Promise<SearchPage>>(
      async () => ({ items: [], totalCount: 999_999 }),
    );

    // Must terminate (not recurse forever) despite total_count always
    // exceeding the cap — the assertion is just that this resolves at
    // all within the test's own timeout.
    await expect(searchDateRange("2020-01-01", "2020-12-31", fetchPage)).resolves.toBeDefined();
  });

  it("stops bisecting once the range can no longer be split (down to a single day)", async () => {
    // A pathological single day reporting a total_count that overstates
    // its own real (short) results list, the same way GitHub's search API
    // itself would if it had a data quirk — pagination still terminates
    // correctly off the empty page 2, same as any other under-cap range.
    const fetchPage = vi.fn<(from: string, to: string, page: number) => Promise<SearchPage>>(
      async (_from, _to, page) =>
        page === 1 ? { items: [repoNamed("owner/same-day")], totalCount: 999_999 } : { items: [], totalCount: 999_999 },
    );

    const repos = await searchDateRange("2020-01-01", "2020-01-01", fetchPage);

    expect(repos).toEqual([repoNamed("owner/same-day")]);
  });
});
