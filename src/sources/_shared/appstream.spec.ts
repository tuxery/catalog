import { describe, expect, it } from "vitest";
import { parseAppstreamXml, resolveIconUrl } from "./appstream";

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
      <release timestamp="1786320000" version="153.0.4">
        <description>
          <p>Fixed a crash on startup.</p>
          <ul>
            <li>Improved tab switching speed</li>
          </ul>
        </description>
      </release>
      <release timestamp="1783728000" version="152.0"/>
    </releases>
    <languages>
      <lang percentage="100">en_US</lang>
      <lang percentage="87">fr</lang>
      <lang percentage="62">de</lang>
    </languages>
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
  <component type="desktop-application">
    <id>org.example.SoloGame</id>
    <name>Solo Game</name>
    <summary>A game with a single category</summary>
    <categories>
      <category>Game</category>
    </categories>
  </component>
  <component type="desktop-application">
    <id>org.example.MultiCategory</id>
    <name>Multi Category</name>
    <summary>A game among several categories</summary>
    <categories>
      <category>Utility</category>
      <category>Game</category>
      <category>Simulation</category>
    </categories>
  </component>
  <component type="desktop-application">
    <id>org.example.RichMetadata</id>
    <name>Rich Metadata</name>
    <summary>Has license, developer, description, and screenshots</summary>
    <project_license>GPL-3.0+ AND LGPL-3.0+</project_license>
    <developer_name>The Example Team</developer_name>
    <description>
      <p>First paragraph, plain text.</p>
      <p>Second paragraph with <em>inline markup</em> that fast-xml-parser turns into a nested object, not a plain string — a real bug hit against live Flathub data (app.authpass.AuthPass).</p>
      <ul>
        <li>First feature</li>
        <li>Second feature</li>
      </ul>
    </description>
    <description xml:lang="fr">
      <p>Ce texte ne doit jamais apparaître dans longDescription.</p>
    </description>
    <screenshots>
      <screenshot type="default">
        <image type="thumbnail">https://example.com/thumb-1.png</image>
        <image type="source">https://example.com/full-1.png</image>
      </screenshot>
      <screenshot>
        <image type="source">https://example.com/full-2.png</image>
      </screenshot>
    </screenshots>
  </component>
  <component type="desktop-application">
    <id>org.example.NewStyleDeveloper</id>
    <name>New Style Developer</name>
    <summary>Uses &lt;developer&gt;&lt;name&gt; instead of developer_name</summary>
    <developer>
      <name>Someone</name>
      <name xml:lang="fr">Quelqu'un</name>
    </developer>
  </component>
  <component type="desktop-application">
    <id>org.example.TranslatedDeveloperName</id>
    <name>Translated Developer Name</name>
    <summary>developer_name repeats per translation too, same as name/summary/description</summary>
    <developer_name>Alex Angelou</developer_name>
    <developer_name xml:lang="el">Αλέξανδρος Αγγέλου</developer_name>
  </component>
  <component type="desktop-application">
    <id>org.example.RemoteIcon</id>
    <name>Remote Icon</name>
    <summary>Has both a cached filename and a ready-to-use remote URL</summary>
    <icon type="cached" width="128" height="128">org.example.RemoteIcon.png</icon>
    <icon type="remote" width="128" height="128" scale="2">https://example.com/icon@2x.png</icon>
    <icon type="remote" width="128" height="128">https://example.com/icon.png</icon>
  </component>
</components>
`;

describe("parseAppstreamXml", () => {
  const entries = parseAppstreamXml(FIXTURE);

  it("keeps app-type components and drops runtimes/addons", () => {
    expect(entries.map((entry) => entry.id)).toEqual([
      "org.mozilla.firefox",
      "org.example.Cli",
      "org.example.NoReleases",
      "org.example.SoloGame",
      "org.example.MultiCategory",
      "org.example.RichMetadata",
      "org.example.NewStyleDeveloper",
      "org.example.TranslatedDeveloperName",
      "org.example.RemoteIcon",
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

  it("extracts language codes from <languages><lang>, dropping the percentage attribute", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox?.languages).toEqual(["en_US", "fr", "de"]);
  });

  it("leaves languages undefined when there's no <languages> at all", () => {
    const rich = entries.find((entry) => entry.id === "org.example.RichMetadata");

    expect(rich?.languages).toBeUndefined();
  });

  it("flattens the newest release's own <description> into changelog, same paragraph/list rules as longDescription", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox?.changelog).toContain("Fixed a crash on startup.");
    expect(firefox?.changelog).toContain("- Improved tab switching speed");
  });

  it("leaves changelog undefined when the newest release has no description, or there are no releases at all", () => {
    const noReleases = entries.find((entry) => entry.id === "org.example.NoReleases");
    const rich = entries.find((entry) => entry.id === "org.example.RichMetadata");

    expect(noReleases?.changelog).toBeUndefined();
    expect(rich?.changelog).toBeUndefined();
  });

  it("converts the newest release's @_timestamp (Unix epoch seconds) to an ISO date string", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    // The *newest* (first) release's timestamp (1786320000), not the
    // older second release's (1783728000).
    expect(firefox?.lastUpdated).toBe("2026-08-10T00:00:00.000Z");
  });

  it("leaves lastUpdated undefined when there are no releases, or the newest one has no timestamp", () => {
    const noReleases = entries.find((entry) => entry.id === "org.example.NoReleases");

    expect(noReleases?.lastUpdated).toBeUndefined();
  });

  it("leaves version/icon/homepage undefined when absent, rather than throwing", () => {
    const noReleases = entries.find((entry) => entry.id === "org.example.NoReleases");

    expect(noReleases?.version).toBeUndefined();
    expect(noReleases?.iconFilename).toBeUndefined();
    expect(noReleases?.homepage).toBeUndefined();
  });

  it("flags hasGameCategory false when there's no <categories> at all", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox?.hasGameCategory).toBe(false);
  });

  it("flags hasGameCategory true for a single Game category", () => {
    const soloGame = entries.find((entry) => entry.id === "org.example.SoloGame");

    expect(soloGame?.hasGameCategory).toBe(true);
  });

  it("flags hasGameCategory true when Game is one of several categories", () => {
    const multiCategory = entries.find((entry) => entry.id === "org.example.MultiCategory");

    expect(multiCategory?.hasGameCategory).toBe(true);
  });

  it("exposes every raw category value, in document order", () => {
    const multiCategory = entries.find((entry) => entry.id === "org.example.MultiCategory");

    expect(multiCategory?.categories).toEqual(["Utility", "Game", "Simulation"]);
  });

  it("exposes an empty categories array when there's no <categories> at all", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox?.categories).toEqual([]);
  });

  it("extracts the license verbatim", () => {
    const rich = entries.find((entry) => entry.id === "org.example.RichMetadata");

    expect(rich?.license).toBe("GPL-3.0+ AND LGPL-3.0+");
  });

  it("extracts developer_name", () => {
    const rich = entries.find((entry) => entry.id === "org.example.RichMetadata");

    expect(rich?.developer).toBe("The Example Team");
  });

  it("falls back to <developer><name> (translated, like <name>/<summary>) when there's no developer_name", () => {
    const entry = entries.find((e) => e.id === "org.example.NewStyleDeveloper");

    expect(entry?.developer).toBe("Someone");
  });

  it("picks the untranslated developer_name, not a translation, when developer_name itself repeats per language", () => {
    // Real bug caught live: io.github.aggalex.Wineglass has both a bare
    // <developer_name> and an xml:lang="el" translation — without
    // treating developer_name the same array-per-translation way as
    // name/summary/description, the raw translation array leaked
    // straight into SourcedPackage.developer, which SQLite then refused
    // to bind when publishing to Turso.
    const entry = entries.find((e) => e.id === "org.example.TranslatedDeveloperName");

    expect(entry?.developer).toBe("Alex Angelou");
    expect(typeof entry?.developer).toBe("string");
  });

  it("flattens <description>'s paragraphs and list items to plain text, only from the untranslated block", () => {
    const rich = entries.find((entry) => entry.id === "org.example.RichMetadata");

    // Word order around inline markup (<em>, ...) specifically isn't
    // guaranteed — fast-xml-parser's non-order-preserving mode splits
    // mixed text+element content into separate keys with no ordering
    // info between them (see extractText's/pickLongDescription's doc
    // comments) — checked via toContain rather than a single exact toBe
    // for that reason. Plain paragraphs (the vast majority of real data)
    // have no such ambiguity, since they're a single #text leaf.
    expect(rich?.longDescription).toContain("First paragraph, plain text.");
    expect(rich?.longDescription).toContain("inline markup");
    expect(rich?.longDescription).toContain(
      "that fast-xml-parser turns into a nested object, not a plain string",
    );
    expect(rich?.longDescription).toContain("- First feature\n- Second feature");
    expect(rich?.longDescription).not.toContain("jamais apparaître");
  });

  it("leaves longDescription undefined when there's no <description> at all", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox?.longDescription).toBeUndefined();
  });

  it("picks each screenshot's source-type image, falling back to the first available size", () => {
    const rich = entries.find((entry) => entry.id === "org.example.RichMetadata");

    expect(rich?.screenshots).toEqual([
      "https://example.com/full-1.png",
      "https://example.com/full-2.png",
    ]);
  });

  it("exposes an empty screenshots array when there are none", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox?.screenshots).toEqual([]);
  });

  it("prefers a non-HiDPI remote icon over an @_scale=2 variant", () => {
    const entry = entries.find((e) => e.id === "org.example.RemoteIcon");

    expect(entry?.remoteIconUrl).toBe("https://example.com/icon.png");
  });

  it("leaves remoteIconUrl undefined when there's no type=remote icon", () => {
    const firefox = entries.find((entry) => entry.id === "org.mozilla.firefox");

    expect(firefox?.remoteIconUrl).toBeUndefined();
  });
});

describe("resolveIconUrl", () => {
  it("prefers remoteIconUrl when present, ignoring repoBase entirely", () => {
    const url = resolveIconUrl(
      { remoteIconUrl: "https://example.com/icon.png", iconFilename: "app.png" },
      "https://other-host.example/repo",
    );

    expect(url).toBe("https://example.com/icon.png");
  });

  it("falls back to resolving iconFilename against repoBase's icons/128x128/ layout", () => {
    const url = resolveIconUrl(
      { remoteIconUrl: undefined, iconFilename: "app.png" },
      "https://example.com/repo/appstream/x86_64",
    );

    expect(url).toBe("https://example.com/repo/appstream/x86_64/icons/128x128/app.png");
  });

  it("returns undefined when there's neither a remote icon nor a filename", () => {
    const url = resolveIconUrl(
      { remoteIconUrl: undefined, iconFilename: undefined },
      "https://example.com",
    );

    expect(url).toBeUndefined();
  });
});
