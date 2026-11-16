import { createClient, type Client } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { aliasPackageKeys, nextAliases, packageOwners, resolveAlias } from "./id-aliases";
import { createTursoClient, type AppRecord, type TursoDataset } from "./turso-client";

type Pkg = { source: string; name: string; appId?: string };

function app(id: string, packages: Pkg[], companions?: unknown[]): AppRecord {
  return {
    id,
    name: id,
    shortDescription: `Does ${id} things`,
    dataConfidence: { score: 0, signals: [] },
    packages,
    ...(companions ? { companions } : {}),
  };
}

const aur = (name: string): Pkg => ({ source: "pacman-aur", name, appId: name });
const debian = (name: string): Pkg => ({ source: "deb-debian", name, appId: name });
const flathub = (appId: string): Pkg => ({ source: "flatpak-flathub", name: appId, appId });
const snap = (name: string): Pkg => ({ source: "snap-snapcraft", name, appId: name });

function dataset(generatedAt: string, apps: AppRecord[]): TursoDataset {
  return { generatedAt, apps };
}

async function aliasesIn(db: Client): Promise<Record<string, string>> {
  const result = await db.execute(`SELECT alias, target FROM id_aliases ORDER BY alias`);
  return Object.fromEntries(result.rows.map((row) => [String(row.alias), String(row.target)]));
}

describe("aliasPackageKeys", () => {
  it("puts the package the id came from first", () => {
    expect(
      aliasPackageKeys("org.example.Foo", [aur("foo"), flathub("org.example.Foo"), debian("foo")]),
    ).toEqual(["flatpak-flathub:org.example.Foo", "pacman-aur:foo", "deb-debian:foo"]);
  });

  it("matches a prefixed id with its `/` turned into `:`", () => {
    expect(
      aliasPackageKeys("appimage:owner:repo", [
        aur("x"),
        { source: "appimage", name: "owner/repo" },
      ]),
    ).toEqual(["appimage:owner/repo", "pacman-aur:x"]);
  });
});

describe("resolveAlias", () => {
  const owners = new Map([
    ["a:1", "one"],
    ["a:2", "two"],
    ["a:3", "two"],
  ]);

  it("follows the package that named the old id, even outvoted", () => {
    expect(resolveAlias(["a:1", "a:2", "a:3"], owners)).toBe("one");
  });

  it("otherwise picks the app holding most of the other packages", () => {
    expect(resolveAlias(["gone", "a:1", "a:2", "a:3"], owners)).toBe("two");
  });

  it("finds nothing when no package is listed any more", () => {
    expect(resolveAlias(["gone", "also-gone"], owners)).toBeUndefined();
  });
});

describe("packageOwners", () => {
  it("maps a companion's packages to the product listing it, after the apps' own", () => {
    const owners = packageOwners([
      app("node", [debian("nodejs")], [{ name: "plugin", packages: [debian("plugin")] }]),
      app("plugin-app", [aur("plugin")]),
      app("other", [debian("other")], [{ name: "x", packages: [aur("plugin")] }]),
    ]);
    expect(owners.get("deb-debian:plugin")).toBe("node");
    expect(owners.get("pacman-aur:plugin")).toBe("plugin-app");
  });
});

describe("nextAliases", () => {
  it("drops an alias for an id listed again, or one leading to itself", () => {
    const live = new Map([
      ["back", { target: "x", packageKeys: ["a:back"] }],
      ["self", { target: "x", packageKeys: ["a:self"] }],
    ]);
    const owners = new Map([
      ["a:back", "y"],
      ["a:self", "self-target"],
    ]);
    expect(nextAliases(live, [], owners, new Set(["back", "y", "self-target"]))).toEqual(
      new Map([["self", { target: "self-target", packageKeys: ["a:self"] }]]),
    );
  });
});

describe("publish", () => {
  describe.each([
    ["incremental", false],
    ["full", true],
  ])("%s", (_mode, full) => {
    it("redirects an id that left the catalog to where its packages went", async () => {
      const db = createClient({ url: "file::memory:" });
      const client = createTursoClient({ url: "" }, db);
      await client.publish(
        dataset("2026-01-01T00:00:00.000Z", [
          app("pacman-aur:foo", [aur("foo"), debian("foo")]),
          app("org.example.Bar", [flathub("org.example.Bar")]),
          app("bar", [snap("bar"), aur("bar")]),
          app("pacman-aur:gone", [aur("gone")]),
          app("pacman-aur:plug", [aur("plug")]),
          app("host", [debian("host")]),
        ]),
      );
      // foo gains a Snap and takes its id; the Flatpak and the Snap of
      // bar merge; gone leaves; plug becomes a companion of host.
      const report = await client.publish(
        dataset("2026-02-01T00:00:00.000Z", [
          app("foo", [snap("foo"), aur("foo"), debian("foo")]),
          app("bar", [snap("bar"), aur("bar"), flathub("org.example.Bar")]),
          app("host", [debian("host")], [{ name: "plug", packages: [aur("plug")] }]),
        ]),
        { full },
      );
      expect(report.aliases).toEqual({ added: 3, repointed: 0, dropped: 0, total: 3 });
      expect(await aliasesIn(db)).toEqual({
        "org.example.Bar": "bar",
        "pacman-aur:foo": "foo",
        "pacman-aur:plug": "host",
      });
    });
  });

  it("collapses a chain, re-points an alias whose target left, drops one whose id came back", async () => {
    const db = createClient({ url: "file::memory:" });
    const client = createTursoClient({ url: "" }, db);
    await client.publish(
      dataset("2026-01-01T00:00:00.000Z", [
        app("pacman-aur:a", [aur("a")]),
        app("deb-debian:back", [debian("back")]),
        app("host", [debian("host")]),
      ]),
    );
    // a -> b (renamed by gaining a Snap); back merges into host.
    await client.publish(
      dataset("2026-02-01T00:00:00.000Z", [
        app("b", [snap("b"), aur("a")]),
        app("host", [debian("host"), debian("back")]),
      ]),
    );
    expect(await aliasesIn(db)).toEqual({ "deb-debian:back": "host", "pacman-aur:a": "b" });

    // b -> c; back is its own app again.
    const report = await client.publish(
      dataset("2026-03-01T00:00:00.000Z", [
        app("c", [snap("c"), aur("a"), snap("b")]),
        app("host", [debian("host")]),
        app("deb-debian:back", [debian("back")]),
      ]),
    );
    expect(await aliasesIn(db)).toEqual({ b: "c", "pacman-aur:a": "c" });
    expect(report.aliases).toEqual({ added: 1, repointed: 1, dropped: 1, total: 2 });

    // Nothing of a or b listed any more: no alias leads anywhere.
    await client.publish(dataset("2026-04-01T00:00:00.000Z", [app("host", [debian("host")])]));
    expect(await aliasesIn(db)).toEqual({});
  });

  it("writes no alias row for an unchanged dataset", async () => {
    const db = createClient({ url: "file::memory:" });
    const client = createTursoClient({ url: "" }, db);
    const first = dataset("2026-01-01T00:00:00.000Z", [app("pacman-aur:a", [aur("a")])]);
    const second = dataset("2026-02-01T00:00:00.000Z", [app("a", [snap("a"), aur("a")])]);
    await client.publish(first);
    await client.publish(second);
    const report = await client.publish(second);
    expect(report.aliases).toEqual({ added: 0, repointed: 0, dropped: 0, total: 1 });
  });
});
