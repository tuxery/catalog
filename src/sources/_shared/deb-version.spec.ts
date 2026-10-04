import { describe, expect, it } from "vitest";
import { compareDebVersions } from "./deb-version";

describe("compareDebVersions", () => {
  it("compares numerically, not lexically", () => {
    expect(compareDebVersions("1.10", "1.2")).toBeGreaterThan(0);
    expect(compareDebVersions("1.96.61", "1.96.7")).toBeGreaterThan(0);
  });

  it("sorts ~ before the plain release and before the end of the string", () => {
    expect(compareDebVersions("8.30.0~beta.1", "8.30.0")).toBeLessThan(0);
    expect(compareDebVersions("8.29.0", "8.30.0~beta.1")).toBeLessThan(0);
    expect(compareDebVersions("1.0~rc1", "1.0~rc2")).toBeLessThan(0);
  });

  it("honours the epoch, then the revision", () => {
    expect(compareDebVersions("1:1.0", "2.0")).toBeGreaterThan(0);
    expect(compareDebVersions("1.0-2", "1.0-10")).toBeLessThan(0);
    expect(compareDebVersions("1.0-1", "1.0")).toBeGreaterThan(0);
  });

  it("treats identical versions as equal", () => {
    expect(compareDebVersions("2.4.1-1", "2.4.1-1")).toBe(0);
    expect(compareDebVersions("1.0", "0:1.0")).toBe(0);
  });
});
