import { describe, expect, it } from "vitest";
import { mapInstallers } from "./fetch";

describe("mapInstallers", () => {
  it("keeps only published, runner: linux installers", () => {
    const installers = [
      { game_id: 1, game_slug: "a", name: "A", runner: "linux", published: true },
      { game_id: 2, game_slug: "b", name: "B", runner: "wine", published: true },
      { game_id: 3, game_slug: "c", name: "C", runner: "linux", published: false },
      { game_id: 4, game_slug: "d", name: "D", runner: "steam", published: true },
    ];

    expect(mapInstallers(installers).map((entry) => entry.gameId)).toEqual([1]);
  });

  it("deduplicates multiple installers for the same game down to one row", () => {
    const installers = [
      {
        game_id: 1,
        game_slug: "a",
        name: "A",
        runner: "linux",
        published: true,
        description: "first",
      },
      {
        game_id: 1,
        game_slug: "a",
        name: "A",
        runner: "linux",
        published: true,
        description: "second",
      },
    ];

    const entries = mapInstallers(installers);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.description).toBe("first");
  });

  it("drops entries missing game_id, game_slug, or name", () => {
    const installers = [
      { game_id: undefined, game_slug: "a", name: "A", runner: "linux", published: true },
      { game_id: 1, game_slug: undefined, name: "A", runner: "linux", published: true },
      { game_id: 1, game_slug: "a", name: undefined, runner: "linux", published: true },
    ];

    expect(mapInstallers(installers)).toEqual([]);
  });

  it("falls back to an empty description when the installer's own description is null", () => {
    const installers = [
      {
        game_id: 1,
        game_slug: "a",
        name: "A",
        runner: "linux",
        published: true,
        description: null,
      },
    ];

    expect(mapInstallers(installers)[0]?.description).toBe("");
  });
});
