import { describe, expect, it } from "vitest";
import { parseAppstream } from "./fetch";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<components version="0.8" origin="flathub">
  <component type="desktop-application">
    <id>org.mozilla.firefox</id>
    <name>Firefox</name>
    <name xml:lang="pl">Firefox PL</name>
    <summary>Fast, Private &amp; Safe Web Browser</summary>
    <summary xml:lang="pl">Szybka przeglądarka</summary>
    <icon height="64" type="cached" width="64">org.mozilla.firefox.png</icon>
    <icon height="128" type="cached" width="128">org.mozilla.firefox-128.png</icon>
    <url type="bugtracker">https://bugzilla.mozilla.org/</url>
    <url type="homepage">https://www.mozilla.org/firefox/</url>
    <releases>
      <release timestamp="1786320000" version="153.0.4"/>
      <release timestamp="1783728000" version="152.0"/>
    </releases>
  </component>
  <component type="console-application">
    <id>org.example.Cli</id>
    <name>Cli Tool</name>
    <summary>A command-line tool</summary>
  </component>
  <component type="runtime">
    <id>org.freedesktop.Platform</id>
    <name>Freedesktop Platform</name>
    <summary>Shared runtime, not an app</summary>
  </component>
  <component type="desktop-application">
    <id>org.example.NoReleases</id>
    <name>No Releases</name>
    <summary>Has no releases or icon yet</summary>
  </component>
</components>
`;

describe("parseAppstream", () => {
  const entries = parseAppstream(FIXTURE);

  it("keeps app-type components and drops runtimes/addons", () => {
    expect(entries.map((entry) => entry.id)).toEqual([
      "org.mozilla.firefox",
      "org.example.Cli",
      "org.example.NoReleases",
    ]);
  });

  it("picks the untranslated (default) name and summary, not a translation", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox?.name).toBe("Firefox");
    expect(firefox?.summary).toBe("Fast, Private & Safe Web Browser");
  });

  it("prefers the cached icon and takes the smallest/first matching entry", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox?.iconFilename).toBe("org.mozilla.firefox.png");
  });

  it("extracts the homepage URL specifically, not just any <url>", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox?.homepage).toBe("https://www.mozilla.org/firefox/");
  });

  it("takes the first (newest) release's version", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox?.version).toBe("153.0.4");
  });

  it("leaves version/icon/homepage undefined when absent, rather than throwing", () => {
    const noReleases = entries.find((entry) => entry.id === "org.example.NoReleases");

    expect(noReleases?.version).toBeUndefined();
    expect(noReleases?.iconFilename).toBeUndefined();
    expect(noReleases?.homepage).toBeUndefined();
  });
});
