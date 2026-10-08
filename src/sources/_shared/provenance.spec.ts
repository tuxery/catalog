import { describe, expect, it } from "vitest";
import type { SourcedPackage } from "../types";
import { withDefaultProvenance } from "./provenance";

const pkg = (overrides: Partial<SourcedPackage>): SourcedPackage => ({
  source: "deb-debian",
  name: "x",
  description: "",
  version: "1",
  ...overrides,
});

describe("withDefaultProvenance", () => {
  it("fills in the source's default", () => {
    expect(withDefaultProvenance(pkg({})).provenance).toBe("distro");
    expect(withDefaultProvenance(pkg({ source: "deb-popos" })).provenance).toBe("upstream");
  });

  it("keeps a provenance the connector already set", () => {
    expect(
      withDefaultProvenance(pkg({ source: "ebuild-gentoo", provenance: "upstream" })).provenance,
    ).toBe("upstream");
  });

  it("leaves sources without a default unknown", () => {
    expect(withDefaultProvenance(pkg({ source: "snap-snapcraft" })).provenance).toBeUndefined();
  });
});
