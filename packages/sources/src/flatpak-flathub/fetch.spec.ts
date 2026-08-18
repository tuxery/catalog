import { describe, expect, it } from "vitest";
import { parseAppstream, rankPopularity } from "./fetch";

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
const POPULARITY_RANKS = new Map([["org.mozilla.firefox", 0.9]]);

describe("parseAppstream", () => {
  const entries = parseAppstream(FIXTURE, ODRS_RATINGS, POPULARITY_RANKS);

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
      popularity: 0.9,
    });
  });

  it("leaves popularity undefined for an id outside the Popular collection", () => {
    const entry = entries.find((e) => e.id === "org.example.RemoteIcon");

    expect(entry?.popularity).toBeUndefined();
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

describe("rankPopularity", () => {
  it("scores rank 1 as 1, decreasing towards 0 for the last hit", () => {
    const hits = [{ app_id: "a" }, { app_id: "b" }, { app_id: "c" }];

    const ranks = rankPopularity(hits);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBeCloseTo(0.5, 5);
    expect(ranks.get("c")).toBe(0);
  });

  it("skips hits with no app_id", () => {
    const ranks = rankPopularity([{ app_id: "a" }, {}]);
    expect(ranks.size).toBe(1);
  });

  it("scores the sole hit as 1 rather than dividing by zero", () => {
    const ranks = rankPopularity([{ app_id: "only" }]);
    expect(ranks.get("only")).toBe(1);
  });
});
