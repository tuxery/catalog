import { describe, expect, it } from "vitest";
import { loadSeed, validateEntries } from "./fetch";

describe("validateEntries", () => {
  it("keeps a complete entry", () => {
    const entries = [{ name: "App", description: "An app", homepage: "https://example.com" }];

    expect(validateEntries(entries)).toEqual(entries);
  });

  it("drops entries missing name, description, or homepage", () => {
    const entries = [
      { name: "", description: "An app", homepage: "https://example.com" },
      { name: "App", description: "An app", homepage: "" },
    ];

    expect(validateEntries(entries)).toEqual([]);
  });

  it("keeps an entry with an empty (not missing) description", () => {
    const entries = [{ name: "App", description: "", homepage: "https://example.com" }];

    expect(validateEntries(entries)).toEqual(entries);
  });
});

describe("loadSeed", () => {
  it("reads the real seed file and includes the motivating pCloud entry", () => {
    const entries = loadSeed();

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((entry) => entry.name === "pCloud Drive")).toBe(true);
  });
});
