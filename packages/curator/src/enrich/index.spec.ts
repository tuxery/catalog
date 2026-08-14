import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "@tuxery/sources";
import type { MatchedApp } from "../match/group";
import { enrichApps } from "./index";

function pkg(overrides: Partial<SourcedPackage>): SourcedPackage {
  return {
    source: "flathub",
    name: "Example",
    description: "An example package.",
    version: "1.0.0",
    ...overrides,
  };
}

describe("enrichApps", () => {
  it("uses the sole package's fields for a single-source group", () => {
    const matched: MatchedApp[] = [
      {
        id: "flathub:org.example.solo",
        packages: [
          pkg({
            name: "Solo",
            description: "The only source.",
            homepage: "https://example.com",
            appId: "org.example.solo",
          }),
        ],
      },
    ];

    const [app] = enrichApps(matched);

    expect(app).toMatchObject({
      id: "flathub:org.example.solo",
      name: "Solo",
      shortDescription: "The only source.",
      homepage: "https://example.com",
    });
    expect(app?.packages).toHaveLength(1);
  });

  it("prefers Flathub over native sources for display fields", () => {
    const matched: MatchedApp[] = [
      {
        id: "aur:example",
        packages: [
          pkg({ source: "aur", name: "example", description: "terse packager description" }),
          pkg({ source: "flathub", name: "Example", description: "Human-readable summary." }),
        ],
      },
    ];

    const [app] = enrichApps(matched);

    expect(app?.name).toBe("Example");
    expect(app?.shortDescription).toBe("Human-readable summary.");
    expect(app?.packages).toHaveLength(2);
  });

  it("prefers Snapcraft over other native sources when Flathub is absent", () => {
    const matched: MatchedApp[] = [
      {
        id: "aur:example",
        packages: [
          pkg({ source: "aur", name: "example", description: "terse" }),
          pkg({ source: "snapcraft", name: "Example", description: "Snap summary." }),
        ],
      },
    ];

    const [app] = enrichApps(matched);

    expect(app?.name).toBe("Example");
    expect(app?.shortDescription).toBe("Snap summary.");
  });

  it("falls back to the first package when no priority source is present", () => {
    const matched: MatchedApp[] = [
      {
        id: "aur:example",
        packages: [
          pkg({ source: "aur", name: "example-aur", description: "aur desc" }),
          pkg({ source: "debian", name: "example-debian", description: "debian desc" }),
        ],
      },
    ];

    const [app] = enrichApps(matched);

    expect(app?.name).toBe("example-aur");
  });

  it("falls back to a lower-priority source's description when the priority source's is blank", () => {
    const matched: MatchedApp[] = [
      {
        id: "appimage:Dygmalab/Bazecor",
        packages: [
          pkg({ source: "appimage", name: "Bazecor", description: "" }),
          pkg({ source: "aur", name: "bazecor", description: "Graphical configurator for Dygma keyboards" }),
        ],
      },
    ];

    const [app] = enrichApps(matched);

    // Name/homepage still come from the priority source (appimage), only
    // the description falls back — see pickDescription's doc comment.
    expect(app?.name).toBe("Bazecor");
    expect(app?.shortDescription).toBe("Graphical configurator for Dygma keyboards");
  });

  it("uses an empty description when no package in the group has one", () => {
    const matched: MatchedApp[] = [
      { id: "appimage:example", packages: [pkg({ source: "appimage", name: "Example", description: "" })] },
    ];

    const [app] = enrichApps(matched);

    expect(app?.shortDescription).toBe("");
  });

  it("carries the full packages array through unchanged", () => {
    const packages = [
      pkg({ source: "flathub", appId: "org.example.a" }),
      pkg({ source: "snapcraft", appId: "example" }),
    ];
    const matched: MatchedApp[] = [{ id: "flathub:org.example.a", packages }];

    const [app] = enrichApps(matched);

    expect(app?.packages).toBe(packages);
  });
});
