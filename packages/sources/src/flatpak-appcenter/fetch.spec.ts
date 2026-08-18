import { describe, expect, it } from "vitest";
import { parseAppstream } from "./fetch";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<components version="0.8" origin="flatpak">
  <component type="desktop">
    <id>com.github.akiraux.akira</id>
    <name>Akira</name>
    <summary>The Linux Design Tool</summary>
    <releases>
      <release timestamp="1628985600" version="0.0.16"/>
    </releases>
  </component>
  <component type="desktop">
    <id>com.example.CachedOnly</id>
    <name>Cached Only</name>
    <summary>Only has a cached-filename icon, no remote URL</summary>
    <icon type="cached" width="128" height="128">com.example.CachedOnly.png</icon>
  </component>
</components>
`;

const ODRS_RATINGS = new Map<string, { average: number; count: number }>();

describe("parseAppstream", () => {
  const entries = parseAppstream(FIXTURE, ODRS_RATINGS);

  it("delegates to the shared AppStream parser", () => {
    const akira = entries.find((entry) => entry.id === "com.github.akiraux.akira");

    expect(akira).toEqual({
      id: "com.github.akiraux.akira",
      name: "Akira",
      summary: "The Linux Design Tool",
      version: "0.0.16",
      iconFilename: undefined,
      iconUrl: undefined,
      homepage: undefined,
      hasGameCategory: false,
      categories: [],
      license: undefined,
      developer: undefined,
      longDescription: undefined,
      screenshots: [],
      rating: undefined,
    });
  });

  it("resolves the icon URL against AppCenter's own repo base — most of its real coverage, unlike Flathub's near-universal remote icon", () => {
    const entry = entries.find((e) => e.id === "com.example.CachedOnly");

    expect(entry?.iconUrl).toBe(
      "https://flatpak.elementary.io/repo/appstream/x86_64/icons/128x128/com.example.CachedOnly.png",
    );
  });
});
