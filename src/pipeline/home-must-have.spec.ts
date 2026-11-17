import { describe, expect, it } from "vitest";
import { readHomeMustHave } from "./home-must-have";

describe("config/home-must-have.json", () => {
  it("lists each app once", () => {
    const ids = readHomeMustHave();
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
