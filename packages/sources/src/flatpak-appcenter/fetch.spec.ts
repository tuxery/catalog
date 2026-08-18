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
</components>
`;

describe("parseAppstream", () => {
  it("delegates to the shared AppStream parser", () => {
    const entries = parseAppstream(FIXTURE);

    expect(entries).toEqual([
      {
        id: "com.github.akiraux.akira",
        name: "Akira",
        summary: "The Linux Design Tool",
        version: "0.0.16",
        iconFilename: undefined,
        homepage: undefined,
        hasGameCategory: false,
        categories: [],
      },
    ]);
  });
});
