import { describe, expect, it } from "vitest";
import { oarsAttributeAge } from "./oars";

describe("oarsAttributeAge", () => {
  it("reads libappstream's table", () => {
    expect(oarsAttributeAge("violence-cartoon", "mild")).toBe(3);
    expect(oarsAttributeAge("violence-realistic", "intense")).toBe(14);
    expect(oarsAttributeAge("sex-prostitution", "intense")).toBe(18);
    expect(oarsAttributeAge("social-info", "mild")).toBe(0);
  });

  it("is 0 for none and for what it doesn't know", () => {
    expect(oarsAttributeAge("violence-cartoon", "none")).toBe(0);
    expect(oarsAttributeAge("violence-cartoon", "extreme")).toBe(0);
    expect(oarsAttributeAge("made-up", "intense")).toBe(0);
  });
});
