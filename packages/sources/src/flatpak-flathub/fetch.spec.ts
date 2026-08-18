import { describe, expect, it } from "vitest";
import { parseAppstream } from "./fetch";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<components version="0.8" origin="flathub">
  <component type="desktop-application">
    <id>org.mozilla.firefox</id>
    <name>Firefox</name>
    <summary>Fast, Private &amp; Safe Web Browser</summary>
    <releases>
      <release timestamp="1786320000" version="153.0.4"/>
    </releases>
  </component>
  <component type="desktop-application">
    <id>org.example.RemoteIcon</id>
    <name>Remote Icon</name>
    <summary>Has a ready-to-use remote icon URL</summary>
    <icon type="cached" width="128" height="128">org.example.RemoteIcon.png</icon>
    <icon type="remote" width="128" height="128">https://dl.flathub.org/media/org/example/RemoteIcon/icon.png</icon>
  </component>
  <component type="desktop-application">
    <id>org.example.CachedOnly</id>
    <name>Cached Only</name>
    <summary>Only has a cached-filename icon, no remote URL</summary>
    <icon type="cached" width="128" height="128">org.example.CachedOnly.png</icon>
  </component>
</components>
`;

const ODRS_RATINGS = new Map([["org.mozilla.firefox.desktop", { average: 3.9, count: 778 }]]);

describe("parseAppstream", () => {
  const entries = parseAppstream(FIXTURE, ODRS_RATINGS);

  it("delegates to the shared AppStream parser", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox).toEqual({
      id: "org.mozilla.firefox",
      name: "Firefox",
      summary: "Fast, Private & Safe Web Browser",
      version: "153.0.4",
      iconFilename: undefined,
      iconUrl: undefined,
      homepage: undefined,
      hasGameCategory: false,
      categories: [],
      license: undefined,
      developer: undefined,
      longDescription: undefined,
      screenshots: [],
      rating: { average: 3.9, count: 778 },
    });
  });

  it("prefers a ready-to-use remote icon URL when present", () => {
    const entry = entries.find((e) => e.id === "org.example.RemoteIcon");

    expect(entry?.iconUrl).toBe("https://dl.flathub.org/media/org/example/RemoteIcon/icon.png");
  });

  it("resolves the icon URL against Flathub's own repo base when there's no remote icon", () => {
    const entry = entries.find((e) => e.id === "org.example.CachedOnly");

    expect(entry?.iconUrl).toBe(
      "https://dl.flathub.org/repo/appstream/x86_64/icons/128x128/org.example.CachedOnly.png",
    );
  });

  it("leaves rating undefined for an id with no ODRS entry", () => {
    const entry = entries.find((e) => e.id === "org.example.RemoteIcon");

    expect(entry?.rating).toBeUndefined();
  });
});
