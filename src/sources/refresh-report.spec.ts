import { describe, expect, it } from "vitest";
import { refreshReport } from "./refresh-report";

describe("refreshReport", () => {
  const now = new Date("2026-11-14T04:00:00Z");

  it("lists the failed sources, then caches older than two weeks, oldest first", () => {
    const report = refreshReport(
      ["pacman-arch", "slackware"],
      [
        ["deb-debian", "2026-11-14T04:10:00Z"],
        ["slackware", "2026-10-17T05:00:00Z"],
        ["gog", "2026-11-07T10:00:00Z"],
        ["nix-nixpkgs", "2026-10-12T05:00:00Z"],
      ],
      now,
    );
    expect(report).toContain("### Failed this run (2)");
    expect(report).toContain("- `pacman-arch`");
    expect(report).toContain("### Caches older than 14 days (2)");
    expect(report.indexOf("nix-nixpkgs")).toBeLessThan(report.indexOf("`slackware`: "));
    expect(report).not.toContain("`gog`");
    expect(report).not.toContain("deb-debian");
  });

  it("says so when everything is fine", () => {
    expect(refreshReport([], [["deb-debian", "2026-11-14T04:10:00Z"]], now)).toMatch(
      /^Every source refreshed/,
    );
  });
});
