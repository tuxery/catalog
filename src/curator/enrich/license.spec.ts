import { describe, expect, it } from "vitest";
import { classifyLicense, toSpdxExpression } from "./license";

describe("toSpdxExpression", () => {
  it("keeps valid SPDX expressions, fixing case and operator spelling", () => {
    expect(toSpdxExpression("MIT")).toBe("MIT");
    expect(toSpdxExpression("zlib")).toBe("Zlib");
    expect(toSpdxExpression("gpl-2.0-only and (mit or apache-2.0)")).toBe(
      "GPL-2.0-only AND (MIT OR Apache-2.0)",
    );
    expect(toSpdxExpression("GPL-2.0-or-later WITH GCC-exception-3.1")).toBe(
      "GPL-2.0-or-later WITH GCC-exception-3.1",
    );
    expect(toSpdxExpression("LicenseRef-proprietary")).toBe("LicenseRef-proprietary");
  });

  it("upgrades deprecated GNU ids the way SPDX defines it", () => {
    expect(toSpdxExpression("GPL-3.0")).toBe("GPL-3.0-only");
    expect(toSpdxExpression("GPL-2.0+")).toBe("GPL-2.0-or-later");
    expect(toSpdxExpression("LGPL-2.1")).toBe("LGPL-2.1-only");
    expect(toSpdxExpression("MPL-1.1+")).toBe("MPL-1.1+");
  });

  it("maps shorthands that name exactly one license, Arch's custom: included", () => {
    expect(toSpdxExpression("Apache 2.0")).toBe("Apache-2.0");
    expect(toSpdxExpression("BSD3")).toBe("BSD-3-Clause");
    expect(toSpdxExpression("MPL2")).toBe("MPL-2.0");
    expect(toSpdxExpression("custom:ISC")).toBe("ISC");
    expect(toSpdxExpression("boost")).toBe("BSL-1.0");
  });

  it("gives up rather than guess a version, a variant or a dropped term", () => {
    for (const raw of [undefined, "", "GPL3", "GPL", "GPLv2", "LGPL2.1", "BSD", "Apache"]) {
      expect(toSpdxExpression(raw)).toBeUndefined();
    }
    expect(toSpdxExpression("Apache AND MIT")).toBeUndefined();
    expect(toSpdxExpression("custom")).toBeUndefined();
    expect(toSpdxExpression("GPL-2.0+ / LGPL")).toBeUndefined();
  });
});

describe("classifyLicense", () => {
  it("recognizes free licenses however each source spells them", () => {
    for (const license of [
      "MIT",
      "GPL",
      "GPL3",
      "GPLv3",
      "GPL-3.0-or-later",
      "GPL-2.0+",
      "LGPL2.1",
      "Apache",
      "BSD",
      "BSD-3-Clause",
      "MPL-2.0",
      "Unlicense",
      "custom:BSD-2-clause",
      "Apache-2.0 AND MIT",
      "GPL-3.0-or-later WITH GCC-exception-3.1",
      "GPL-2.0 AND OFL-1.1 AND Apache-2.0",
      "CC-BY-SA-4.0",
    ]) {
      expect(classifyLicense(license)).toBe("free");
    }
  });

  it("calls proprietary only what says so", () => {
    for (const license of [
      "EULA",
      "LicenseRef-proprietary",
      "custom:commercial",
      "Freeware",
      "custom:Brother EULA AND GPL2",
      "custom:Epson End User Software License Agreement",
    ]) {
      expect(classifyLicense(license)).toBe("proprietary");
    }
  });

  it("gives no verdict when it can't tell", () => {
    for (const license of [
      undefined,
      "",
      "custom",
      "unknown",
      "LicenseRef-custom",
      "None",
      "GNU",
      "custom AND MIT",
      "BUSL-1.1",
      "CC-BY-NC-4.0",
      "MIT OR proprietary",
    ]) {
      expect(classifyLicense(license)).toBe("unknown");
    }
  });
});
