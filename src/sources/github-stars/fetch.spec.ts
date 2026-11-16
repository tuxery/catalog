import { describe, expect, it } from "vitest";
import {
  buildQuery,
  collectStars,
  parseBatch,
  queryBatch,
  queryOrder,
  toEntry,
  type GraphqlResponse,
  type PostQuery,
} from "./fetch";
import type { GithubStarsCacheEntry } from "./types";

/** A fake GraphQL endpoint: answers each aliased repository from `stars`, NOT_FOUND for the rest. */
function fakeGithub(
  stars: Record<string, number>,
  remaining = 4000,
): PostQuery & { queries: string[] } {
  const queries: string[] = [];
  const post = async (query: string): Promise<GraphqlResponse> => {
    queries.push(query);
    const data: Record<string, unknown> = { rateLimit: { remaining } };
    const errors: { type: string; path: string[] }[] = [];
    for (const [, alias, owner, name] of query.matchAll(
      /(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g,
    )) {
      const repo = `${owner}/${name}`;
      if (repo in stars) data[alias!] = { nameWithOwner: repo, stargazerCount: stars[repo] };
      else {
        data[alias!] = null;
        errors.push({ type: "NOT_FOUND", path: [alias!] });
      }
    }
    return { status: 200, body: { data, errors } };
  };
  return Object.assign(post, { queries });
}

describe("buildQuery", () => {
  it("aliases one repository field per repository, in order", () => {
    expect(buildQuery(["foo/bar", "baz/qux.js"])).toBe(
      'query { rateLimit { remaining } r0: repository(owner: "foo", name: "bar") { nameWithOwner stargazerCount } r1: repository(owner: "baz", name: "qux.js") { nameWithOwner stargazerCount } }',
    );
  });
});

describe("parseBatch", () => {
  it("reads found and missing repositories and the points left", () => {
    const result = parseBatch(["a/a", "b/b"], {
      data: {
        rateLimit: { remaining: 42 },
        r0: { nameWithOwner: "A/a", stargazerCount: 5 },
        r1: null,
      },
      errors: [{ type: "NOT_FOUND", path: ["r1"] }],
    });
    expect([...result.found.keys()]).toEqual(["a/a"]);
    expect(result.missing).toEqual(["b/b"]);
    expect(result.remaining).toBe(42);
  });

  it("throws on an error that isn't about one repository, rather than reading everything as missing", () => {
    expect(() =>
      parseBatch(["a/a"], { data: null, errors: [{ type: "RATE_LIMITED", message: "slow down" }] }),
    ).toThrow("slow down");
  });
});

describe("queryBatch", () => {
  it("splits a batch GitHub times out on, down to the repository that keeps failing", async () => {
    const github = fakeGithub({ "a/a": 1, "b/b": 2, "c/c": 3 });
    const post: PostQuery = async (query) =>
      query.includes('"c"') ? { status: 502 } : github(query);

    const result = await queryBatch(["a/a", "b/b", "c/c"], post, async () => undefined);
    expect([...result.found.keys()].toSorted()).toEqual(["a/a", "b/b"]);
    expect(result.unanswered).toEqual(["c/c"]);
  });

  it("waits out a secondary rate limit, then asks again", async () => {
    const github = fakeGithub({ "a/a": 1 });
    const waits: number[] = [];
    let calls = 0;
    const post: PostQuery = async (query) =>
      ++calls === 1 ? { status: 403, retryAfter: 7 } : github(query);

    const result = await queryBatch(["a/a"], post, async (ms) => waits.push(ms));
    expect(waits).toEqual([7000]);
    expect(result.found.get("a/a")?.stargazerCount).toBe(1);
  });

  it("throws on an unexpected status", async () => {
    await expect(queryBatch(["a/a"], async () => ({ status: 401 }))).rejects.toThrow("HTTP 401");
  });
});

describe("toEntry", () => {
  it("records GitHub's current name only for a renamed repository", () => {
    expect(toEntry("foo/bar", { nameWithOwner: "Foo/Bar", stargazerCount: 3 })).toEqual({
      repo: "foo/bar",
      stars: 3,
    });
    expect(toEntry("old/name", { nameWithOwner: "New/Name", stargazerCount: 3 })).toEqual({
      repo: "old/name",
      stars: 3,
      canonical: "new/name",
    });
  });
});

describe("queryOrder", () => {
  const previous = new Map([
    ["a/a", 1],
    ["b/b", 1],
    ["c/c", 1],
  ]);

  it("asks about new repositories first, then the known ones from the cursor on, wrapping around", () => {
    expect(queryOrder(["a/a", "b/b", "c/c", "new/one"], previous, "b/b")).toEqual([
      "new/one",
      "b/b",
      "c/c",
      "a/a",
    ]);
  });

  it("starts from the top without a cursor, or with one past the last repository", () => {
    expect(queryOrder(["c/c", "a/a", "b/b"], previous, undefined)).toEqual(["a/a", "b/b", "c/c"]);
    expect(queryOrder(["c/c", "a/a", "b/b"], previous, "z/z")).toEqual(["a/a", "b/b", "c/c"]);
  });
});

describe("collectStars", () => {
  it("keeps found repositories, drops missing ones, sorted by repository", async () => {
    const github = fakeGithub({ "b/b": 2, "a/a": 1 });
    const { entries, queried, missing } = await collectStars(
      ["b/b", "a/a", "gone/gone"],
      new Map(),
      github,
    );
    expect(entries).toEqual([
      { repo: "a/a", stars: 1 },
      { repo: "b/b", stars: 2 },
    ]);
    expect(queried).toBe(3);
    expect(missing).toBe(1);
  });

  it("stops once the rate limit is nearly spent, keeping the previous stars of the rest", async () => {
    const repos = Array.from(
      { length: 1000 },
      (_, index) => `o/r${String(index).padStart(4, "0")}`,
    );
    const stars = Object.fromEntries(repos.map((repo) => [repo, 10]));
    const previous = new Map<string, GithubStarsCacheEntry>(
      repos.map((repo) => [repo, { repo, stars: 1 }]),
    );
    const github = fakeGithub(stars, 10);

    const { entries, queried, cursor } = await collectStars(repos, previous, github);
    expect(queried).toBeLessThan(repos.length);
    expect(entries).toHaveLength(repos.length);
    expect(entries.filter((entry) => entry.stars === 10)).toHaveLength(queried);
    expect(cursor).toBe(repos[queried]);
  });

  it("stops asking, without failing, when GitHub keeps refusing for its rate limits", async () => {
    const previous = new Map<string, GithubStarsCacheEntry>([["a/a", { repo: "a/a", stars: 1 }]]);
    const result = await collectStars(["a/a"], previous, async () => ({ status: 403 }), {
      wait: async () => undefined,
    });
    expect(result.entries).toEqual([{ repo: "a/a", stars: 1 }]);
    expect(result.queried).toBe(0);
    expect(result.cursor).toBe("a/a");
  });

  it("asks at most `maxQueries` queries, and says where the next run starts", async () => {
    const repos = Array.from({ length: 250 }, (_, index) => `o/r${String(index).padStart(3, "0")}`);
    const previous = new Map<string, GithubStarsCacheEntry>(
      repos.map((repo) => [repo, { repo, stars: 1 }]),
    );
    const github = fakeGithub(Object.fromEntries(repos.map((repo) => [repo, 10])));

    const first = await collectStars(repos, previous, github, { maxQueries: 2 });
    expect(first.queried).toBe(200);
    expect(first.cursor).toBe("o/r200");

    const second = await collectStars(repos, previous, github, {
      cursor: first.cursor,
      maxQueries: 2,
    });
    expect(second.queried).toBe(200);
    expect(second.cursor).toBe("o/r150");
  });
});
