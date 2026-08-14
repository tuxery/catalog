import { describe, expect, it } from "vitest";
import { loadFilterOverrides, overrideKey } from "./overrides";

describe("overrideKey", () => {
  it("combines source and name", () => {
    expect(overrideKey({ source: "debian", name: "firefox" })).toBe("debian:firefox");
  });
});

describe("loadFilterOverrides", () => {
  it("reads the real (currently empty) override files without throwing", () => {
    const overrides = loadFilterOverrides();

    expect(overrides.keep).toBeInstanceOf(Set);
    expect(overrides.exclude).toBeInstanceOf(Set);
  });
});
