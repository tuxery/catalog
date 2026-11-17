import { describe, expect, it } from "vitest";
import { fetchGithubAbout, toAbout } from "./about";
import type { GraphqlResponse, PostQuery } from "./fetch";

describe("toAbout", () => {
  it("keeps the description, whitespace folded, and the topic names", () => {
    expect(
      toAbout("foo/bar", {
        description: "  A  tool\nfor foo ",
        repositoryTopics: { nodes: [{ topic: { name: "cli" } }, null, { topic: {} }] },
      }),
    ).toEqual({ repo: "foo/bar", description: "A tool for foo", topics: ["cli"] });
  });

  it("leaves empty fields out", () => {
    expect(toAbout("foo/bar", { description: null, repositoryTopics: { nodes: [] } })).toEqual({
      repo: "foo/bar",
    });
  });
});

describe("fetchGithubAbout", () => {
  it("asks for descriptions and topics, and gives a missing repository an empty row", async () => {
    const queries: string[] = [];
    const post: PostQuery = async (query): Promise<GraphqlResponse> => {
      queries.push(query);
      return {
        status: 200,
        body: {
          data: {
            rateLimit: { remaining: 100 },
            r0: { description: "Foo", repositoryTopics: { nodes: [{ topic: { name: "x" } }] } },
            r1: null,
          },
          errors: [{ type: "NOT_FOUND", path: ["r1"] }],
        },
      };
    };
    expect(await fetchGithubAbout(["a/a", "b/b"], post)).toEqual([
      { repo: "a/a", description: "Foo", topics: ["x"] },
      { repo: "b/b" },
    ]);
    expect(queries[0]).toContain("repositoryTopics");
    expect(queries[0]).not.toContain("stargazerCount");
  });

  it("stops, keeping what it has, when GitHub keeps refusing for its rate limits", async () => {
    const rows = await fetchGithubAbout(
      ["a/a"],
      async () => ({ status: 403 }),
      async () => {},
    );
    expect(rows).toEqual([]);
  });
});
