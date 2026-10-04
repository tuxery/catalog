import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REFRESHERS } from "./refreshers";

describe("REFRESHERS", () => {
  it("has a refresher for every committed source cache, and nothing else", () => {
    const cached = readdirSync(fileURLToPath(new URL("./cache", import.meta.url)))
      .filter((file) => file.endsWith(".ndjson"))
      .map((file) => file.replace(/\.ndjson$/, ""));
    expect(new Set(Object.keys(REFRESHERS))).toEqual(new Set(cached));
  });
});
