import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cachePathFor, hasCacheDir, RESTRICTED_SOURCES } from "./cache-path";

describe("cachePathFor", () => {
  it("keeps a public source's cache in this repository", () => {
    expect(cachePathFor("flatpak-flathub", {})).toMatch(
      /src\/sources\/cache\/flatpak-flathub\.ndjson$/,
    );
  });

  it("puts a restricted source's cache in the private checkout", () => {
    expect(RESTRICTED_SOURCES.has("appimagehub")).toBe(true);
    expect(cachePathFor("appimagehub", { TUXERY_PRIVATE_CACHE_DIR: "/private/cache" })).toBe(
      join("/private/cache", "appimagehub.ndjson"),
    );
  });
});

describe("hasCacheDir", () => {
  it("is always true for a public source, and needs the checkout for a restricted one", () => {
    const missing = { TUXERY_PRIVATE_CACHE_DIR: "/nonexistent/tuxery-source-cache" };
    expect(hasCacheDir("deb-debian", missing)).toBe(true);
    expect(hasCacheDir("appimagehub", missing)).toBe(false);
  });
});
