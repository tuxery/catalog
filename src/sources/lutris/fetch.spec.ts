import { describe, expect, it } from "vitest";
import { mapInstallers } from "./fetch";

describe("mapInstallers", () => {
  it("keeps only published, runner: linux installers", () => {
    const installers = [
      { game_id: 1, game_slug: "a", slug: "a-gog", name: "A", runner: "linux", published: true },
      { game_id: 2, game_slug: "b", slug: "b-gog", name: "B", runner: "wine", published: true },
      { game_id: 3, game_slug: "c", slug: "c-gog", name: "C", runner: "linux", published: false },
      { game_id: 4, game_slug: "d", slug: "d-gog", name: "D", runner: "steam", published: true },
    ];

    expect(mapInstallers(installers).map((entry) => entry.gameId)).toEqual([1]);
  });

  it("keeps one row per installer, not per game — a game can have several storefront-specific installers", () => {
    const installers = [
      {
        game_id: 1,
        game_slug: "a",
        slug: "a-gog",
        name: "A",
        runner: "linux",
        published: true,
        version: "GOG",
      },
      {
        game_id: 1,
        game_slug: "a",
        slug: "a-steam",
        name: "A",
        runner: "linux",
        published: true,
        version: "Steam",
      },
    ];

    const entries = mapInstallers(installers);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.installerSlug)).toEqual(["a-gog", "a-steam"]);
    expect(entries.map((entry) => entry.version)).toEqual(["GOG", "Steam"]);
  });

  it("deduplicates by installerSlug — a defensive measure, not an expected case", () => {
    const installers = [
      {
        game_id: 1,
        game_slug: "a",
        slug: "a-gog",
        name: "A",
        runner: "linux",
        published: true,
        description: "first",
      },
      {
        game_id: 1,
        game_slug: "a",
        slug: "a-gog",
        name: "A",
        runner: "linux",
        published: true,
        description: "second",
      },
    ];

    const entries = mapInstallers(installers);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.description).toBe("second");
  });

  it("drops entries missing game_id, game_slug, slug, or name", () => {
    const installers = [
      {
        game_id: undefined,
        game_slug: "a",
        slug: "a-gog",
        name: "A",
        runner: "linux",
        published: true,
      },
      {
        game_id: 1,
        game_slug: undefined,
        slug: "a-gog",
        name: "A",
        runner: "linux",
        published: true,
      },
      { game_id: 1, game_slug: "a", slug: undefined, name: "A", runner: "linux", published: true },
      {
        game_id: 1,
        game_slug: "a",
        slug: "a-gog",
        name: undefined,
        runner: "linux",
        published: true,
      },
    ];

    expect(mapInstallers(installers)).toEqual([]);
  });

  it("falls back to an empty description when the installer's own description is null", () => {
    const installers = [
      {
        game_id: 1,
        game_slug: "a",
        slug: "a-gog",
        name: "A",
        runner: "linux",
        published: true,
        description: null,
      },
    ];

    expect(mapInstallers(installers)[0]?.description).toBe("");
  });

  it("leaves version undefined when Lutris doesn't set one", () => {
    const installers = [
      { game_id: 1, game_slug: "a", slug: "a-gog", name: "A", runner: "linux", published: true },
    ];

    expect(mapInstallers(installers)[0]?.version).toBeUndefined();
  });
});
