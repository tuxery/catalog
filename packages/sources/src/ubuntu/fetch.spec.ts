import { describe, expect, it } from "vitest";
import { parsePackages } from "./fetch";

const FIXTURE = `Package: 0ad
Version: 0.27.0-2+b1ubuntu1
Architecture: amd64
Description: Real-time strategy game of ancient warfare
 Longer description on a continuation line.
Homepage: https://play0ad.com/
Section: universe/games

Package: 0ad-data
Version: 0.27.0-1
Architecture: all
Description: Real-time strategy game of ancient warfare (data files)
`;

describe("parsePackages", () => {
  const entries = parsePackages(FIXTURE, "universe");

  it("parses every stanza", () => {
    expect(entries.map((entry) => entry.name)).toEqual(["0ad", "0ad-data"]);
  });

  it("extracts version and homepage", () => {
    expect(entries[0]?.version).toBe("0.27.0-2+b1ubuntu1");
    expect(entries[0]?.homepage).toBe("https://play0ad.com/");
  });

  it("leaves homepage undefined when the field is absent", () => {
    expect(entries[1]?.homepage).toBeUndefined();
  });

  it("stamps every row with the given component", () => {
    expect(entries.every((entry) => entry.component === "universe")).toBe(true);
  });

  it("stamps a different component when called for main", () => {
    const mainEntries = parsePackages(FIXTURE, "main");

    expect(mainEntries.every((entry) => entry.component === "main")).toBe(true);
  });

  it("captures the raw Section field, still component-prefixed", () => {
    // normalize.ts is the one that strips the "universe/" prefix — the
    // cache row stays close to the upstream value, per this file's own
    // header comment.
    expect(entries[0]?.section).toBe("universe/games");
  });

  it("leaves section undefined when the field is absent", () => {
    expect(entries[1]?.section).toBeUndefined();
  });
});
