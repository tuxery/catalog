import { describe, expect, it } from "vitest";
import { resolveCurrentSuite } from "./ubuntu-suite";

describe("resolveCurrentSuite", () => {
  it("picks the series marked Current Stable Release, ignoring Supported/Obsolete ones", () => {
    const series = [
      { name: "stonking", status: "Active Development" },
      { name: "resolute", status: "Current Stable Release" },
      { name: "noble", status: "Supported" },
      { name: "jammy", status: "Supported" },
      { name: "mantic", status: "Obsolete" },
    ];

    expect(resolveCurrentSuite(series)).toBe("resolute");
  });

  it("throws when no series is marked Current Stable Release", () => {
    const series = [{ name: "noble", status: "Supported" }];

    expect(() => resolveCurrentSuite(series)).toThrow(/no current Ubuntu/);
  });
});
