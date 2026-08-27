import { describe, expect, it } from "vitest";
import { UnionFind } from "./union-find";

describe("UnionFind", () => {
  it("treats untouched elements as their own singleton set", () => {
    const uf = new UnionFind<string>();

    expect(uf.connected("a", "b")).toBe(false);
  });

  it("connects two elements after a union", () => {
    const uf = new UnionFind<string>();
    uf.union("a", "b");

    expect(uf.connected("a", "b")).toBe(true);
  });

  it("is transitive across chained unions", () => {
    const uf = new UnionFind<string>();
    uf.union("a", "b");
    uf.union("b", "c");

    expect(uf.connected("a", "c")).toBe(true);
  });

  it("keeps unrelated elements apart", () => {
    const uf = new UnionFind<string>();
    uf.union("a", "b");
    uf.union("c", "d");

    expect(uf.connected("a", "c")).toBe(false);
  });

  it("is idempotent — unioning already-connected elements changes nothing", () => {
    const uf = new UnionFind<string>();
    uf.union("a", "b");
    uf.union("a", "b");

    expect(uf.connected("a", "b")).toBe(true);
    expect(uf.find("a")).toBe(uf.find("b"));
  });
});
