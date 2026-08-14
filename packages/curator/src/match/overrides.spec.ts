import { describe, expect, it } from "vitest";
import { loadMatchOverrides } from "./overrides";

describe("loadMatchOverrides", () => {
  it("reads the real (currently empty) override files without throwing", () => {
    const overrides = loadMatchOverrides();

    expect(overrides.manual).toEqual([]);
    expect(overrides.denyPairs).toBeInstanceOf(Set);
    expect(overrides.denyPairs.size).toBe(0);
  });
});
