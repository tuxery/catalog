import { describe, expect, it } from "vitest";
import { epochSecondsToIso, positiveInt } from "./epoch";

describe("epochSecondsToIso", () => {
  it("turns epoch seconds, as a number or text, into an ISO date", () => {
    expect(epochSecondsToIso(1791363489)).toBe("2026-10-07T08:58:09.000Z");
    expect(epochSecondsToIso("1791363489")).toBe("2026-10-07T08:58:09.000Z");
  });

  it("ignores zero, missing and non-numeric values", () => {
    expect(epochSecondsToIso(0)).toBeUndefined();
    expect(epochSecondsToIso(undefined)).toBeUndefined();
    expect(epochSecondsToIso("soon")).toBeUndefined();
  });
});

describe("positiveInt", () => {
  it("keeps whole positive numbers only", () => {
    expect(positiveInt("26731912")).toBe(26731912);
    expect(positiveInt(0)).toBeUndefined();
    expect(positiveInt("1.5")).toBeUndefined();
    expect(positiveInt(undefined)).toBeUndefined();
  });
});
