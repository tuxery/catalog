import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RESTRICTED_SOURCES } from "./_shared/cache-path";
import { REFRESHERS } from "./refreshers";

describe("REFRESHERS", () => {
  it("has a refresher for every committed source cache and every restricted source, and nothing else", () => {
    const cached = readdirSync(fileURLToPath(new URL("./cache", import.meta.url)))
      .filter((file) => file.endsWith(".ndjson"))
      .map((file) => file.replace(/\.ndjson$/, ""));
    expect(new Set(Object.keys(REFRESHERS))).toEqual(new Set([...cached, ...RESTRICTED_SOURCES]));
  });

  it("never has a restricted source's cache in this public repository", () => {
    const cached = readdirSync(fileURLToPath(new URL("./cache", import.meta.url)));
    expect(cached.filter((file) => RESTRICTED_SOURCES.has(file.split(".")[0] ?? ""))).toEqual([]);
  });
});
