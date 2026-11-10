import { describe, expect, it } from "vitest";
import { readSourceTerms } from "./source-terms";

describe("readSourceTerms", () => {
  it("reads config/source-terms.json, one record per source", () => {
    const terms = readSourceTerms();
    expect(terms?.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(terms?.sources["ebuild-gentoo"]?.verdict).toBe("clear");
  });

  it("reads as undefined when the file can't be read", () => {
    expect(readSourceTerms(new URL("file:///nonexistent/source-terms.json"))).toBeUndefined();
  });
});
