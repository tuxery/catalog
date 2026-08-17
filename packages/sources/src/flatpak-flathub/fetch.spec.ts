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
</components>
`;

describe("parseAppstream", () => {
  it("delegates to the shared AppStream parser", () => {
    const entries = parseAppstream(FIXTURE);

    expect(entries).toEqual([
      {
        id: "org.mozilla.firefox",
        name: "Firefox",
        summary: "Fast, Private & Safe Web Browser",
        version: "153.0.4",
        iconFilename: undefined,
        homepage: undefined,
      },
    ]);
  });
});
