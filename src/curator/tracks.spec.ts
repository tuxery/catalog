import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../sources/types";
import { enrichApps, groupPackages } from ".";

const pkg = (extra: Partial<SourcedPackage>): SourcedPackage => ({
  source: "slackware",
  name: "vim",
  description: "Vi IMproved",
  version: "9.1-1",
  appId: "vim",
  ...extra,
});

describe("a track of one source", () => {
  it("stays a package of the same app, next to the default line", () => {
    const apps = enrichApps(groupPackages([pkg({}), pkg({ version: "9.0-1", track: "15.0" })]));
    expect(apps).toHaveLength(1);
    expect(apps[0]?.packages.map(({ version, track }) => [version, track])).toEqual([
      ["9.1-1", undefined],
      ["9.0-1", "15.0"],
    ]);
  });
});
