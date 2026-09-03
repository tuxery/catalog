import { describe, expect, it } from "vitest";
import { flattenHtmlDescription, parseDep11Yaml } from "./dep11";

const FIXTURE = `---
File: DEP-11
Version: '1.0'
Origin: debian-trixie-main
MediaBaseUrl: https://appstream.debian.org/media/trixie
Time: 20250808T201448
---
Type: desktop-application
ID: org.gnome.gitg
Package: gitg
ProjectLicense: GPL-2.0+
Name:
  zh-Hant-TW: gitg
  fr: gitg (fr)
  C: gitg
Summary:
  fr: Une interface graphique pour git
  C: GUI text editor for git repositories
Developer:
  id: org.gnome
  name:
    sv: Gitg-gruppen
    C: The gitg team
Description:
  fr: >-
    <p>Ne doit jamais apparaître.</p>
  C: >-
    <p>First paragraph about gitg.</p>

    <p>Second paragraph with &amp; entities and <em>inline markup</em>.</p>

    <ul>
      <li>View local repositories</li>
      <li>Clone remote ones</li>
    </ul>
Categories:
- Development
- RevisionControl
Url:
  homepage: https://wiki.gnome.org/Apps/Gitg
  bugtracker: https://gitlab.gnome.org/GNOME/gitg/issues
Icon:
  cached:
  - name: gitg_org.gnome.gitg.png
    width: 48
    height: 48
  - name: gitg_org.gnome.gitg.png
    width: 128
    height: 128
  remote:
  - url: org/gnome/gitg/8f3ac/icons/128x128/gitg_org.gnome.gitg.png
    width: 128
    height: 128
  stock: org.gnome.gitg
Launchable:
  desktop-id:
  - org.gnome.gitg.desktop
Provides:
  mediatypes:
  - x-scheme-handler/gitg
Languages:
- locale: as
  percentage: 42
- locale: bg
  percentage: 100
Screenshots:
- default: true
  caption:
    sv: Lösenordshantering
    C: Password management
  thumbnails:
  - url: org/gnome/World.Secrets/hash/screenshots/image-1_752x568@1.png
    width: 752
    height: 568
  source-image:
    url: org/gnome/World.Secrets/hash/screenshots/image-1_orig.png
    width: 1046
    height: 791
- caption:
    C: Safe unlocking
  source-image:
    url: org/gnome/World.Secrets/hash/screenshots/image-2_orig.png
    width: 1046
    height: 791
Type: console-application
ID: org.example.Cli
Package: cli-tool
Name:
  C: Cli Tool
Summary:
  C: A command-line tool
Type: addon
ID: org.example.Addon
Package: some-addon
Name:
  C: Addon
Type: desktop-application
ID: org.example.NoPackage
Name:
  C: No Package
Type: desktop-application
ID: org.example.Quoted
Package: quoted-app
Name:
  C: 'Quoted: Name'
Summary:
  C: "Summary value"
`;

describe("parseDep11Yaml", () => {
  const document = parseDep11Yaml(FIXTURE);

  it("extracts MediaBaseUrl from the header", () => {
    expect(document.mediaBaseUrl).toBe("https://appstream.debian.org/media/trixie");
  });

  it("keeps app-type components with a Package, drops addons and package-less entries", () => {
    expect(document.components.map((component) => component.id)).toEqual([
      "org.gnome.gitg",
      "org.example.Cli",
      "org.example.Quoted",
    ]);
  });

  it("reads the untranslated C name/summary, not translations", () => {
    const gitg = document.components[0];

    expect(gitg?.name).toBe("gitg");
    expect(gitg?.summary).toBe("GUI text editor for git repositories");
    expect(gitg?.summary).not.toContain("interface graphique");
  });

  it("reads scalar top-level fields", () => {
    const gitg = document.components[0];

    expect(gitg?.type).toBe("desktop-application");
    expect(gitg?.pkgname).toBe("gitg");
    expect(gitg?.license).toBe("GPL-2.0+");
    expect(gitg?.developer).toBe("The gitg team");
    expect(gitg?.homepage).toBe("https://wiki.gnome.org/Apps/Gitg");
  });

  it("flattens the C description block scalar to plain text, skipping translations", () => {
    const gitg = document.components[0];

    expect(gitg?.longDescription).toContain("First paragraph about gitg.");
    expect(gitg?.longDescription).toContain("Second paragraph with & entities and inline markup.");
    expect(gitg?.longDescription).toContain("- View local repositories");
    expect(gitg?.longDescription).toContain("- Clone remote ones");
    expect(gitg?.longDescription).not.toContain("Ne doit jamais apparaître");
    expect(gitg?.longDescription).not.toContain("<p>");
  });

  it("collects every raw category value", () => {
    expect(document.components[0]?.categories).toEqual(["Development", "RevisionControl"]);
  });

  it("resolves the remote icon against MediaBaseUrl, ignoring cached/stock", () => {
    expect(document.components[0]?.iconUrl).toBe(
      "https://appstream.debian.org/media/trixie/org/gnome/gitg/8f3ac/icons/128x128/gitg_org.gnome.gitg.png",
    );
  });

  it("resolves source-image screenshot urls, skipping thumbnails", () => {
    expect(document.components[0]?.screenshots).toEqual([
      "https://appstream.debian.org/media/trixie/org/gnome/World.Secrets/hash/screenshots/image-1_orig.png",
      "https://appstream.debian.org/media/trixie/org/gnome/World.Secrets/hash/screenshots/image-2_orig.png",
    ]);
  });

  it("collects locale codes with their percentage lines skipped", () => {
    expect(document.components[0]?.languages).toEqual(["as", "bg"]);
  });

  it("keeps a minimal console-application component", () => {
    const cli = document.components[1];

    expect(cli?.type).toBe("console-application");
    expect(cli?.pkgname).toBe("cli-tool");
    expect(cli?.name).toBe("Cli Tool");
    expect(cli?.longDescription).toBeUndefined();
    expect(cli?.iconUrl).toBeUndefined();
  });

  it("strips surrounding YAML quotes from scalars", () => {
    const quoted = document.components[2];

    expect(quoted?.name).toBe("Quoted: Name");
    expect(quoted?.summary).toBe("Summary value");
  });

  it("parses a header-less document without throwing", () => {
    const headerless = parseDep11Yaml("Type: desktop-application\nID: x\nPackage: x\n");

    expect(headerless.components).toHaveLength(1);
    expect(headerless.mediaBaseUrl).toBeUndefined();
  });
});

describe("flattenHtmlDescription", () => {
  it("turns paragraphs and lists into the shared plain-text conventions", () => {
    const flattened = flattenHtmlDescription(
      "<p>One.</p><p>Two with <em>markup</em>.</p><ul><li>a</li><li>b</li></ul>",
    );

    expect(flattened).toBe("One.\n\nTwo with markup.\n\n- a\n- b");
  });

  it("decodes common entities", () => {
    expect(flattenHtmlDescription("<p>A &amp; B &lt;c&gt; &quot;d&quot; l&apos;e</p>")).toBe(
      'A & B <c> "d" l\'e',
    );
  });
});
