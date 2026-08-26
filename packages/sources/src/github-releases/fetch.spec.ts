import { describe, expect, it, vi } from "vitest";
import { resolveEntries } from "./fetch";
import type { RawRelease } from "./fetch";

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
