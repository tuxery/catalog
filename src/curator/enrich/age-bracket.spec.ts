import { describe, expect, it } from "vitest";
import contract from "../../store/store-contract.json";
import { AGE_BRACKETS, ageBracket } from "./age-bracket";

describe("ageBracket", () => {
  it("rounds a minimum age up to the next PEGI bracket", () => {
    expect(ageBracket("0")).toBe(3);
    expect(ageBracket("3")).toBe(3);
    expect(ageBracket("4")).toBe(7);
    expect(ageBracket("7")).toBe(7);
    expect(ageBracket("8")).toBe(12);
    expect(ageBracket("13")).toBe(16);
    expect(ageBracket("15")).toBe(16);
    expect(ageBracket("17")).toBe(18);
    expect(ageBracket("18")).toBe(18);
  });

  it("caps an age past the scale at 18", () => {
    expect(ageBracket(21)).toBe(18);
  });

  it("maps PEGI, USK and ESRB ages (as GOG's minimum ages) onto the scale", () => {
    // PEGI keeps its own bracket.
    for (const pegi of [3, 7, 12, 16, 18]) expect(ageBracket(pegi)).toBe(pegi);
    // USK 0/6/12/16/18.
    expect([0, 6, 12, 16, 18].map((usk) => ageBracket(usk))).toEqual([3, 7, 12, 16, 18]);
    // ESRB Everyone (6), Everyone 10+ (10), Teen (13), Mature (17), Adults Only (18).
    expect([6, 10, 13, 17, 18].map((esrb) => ageBracket(esrb))).toEqual([7, 12, 16, 18, 18]);
  });

  it("leaves a missing or unreadable age unrated, never all ages", () => {
    expect(ageBracket(undefined)).toBeUndefined();
    expect(ageBracket("")).toBeUndefined();
    expect(ageBracket("n/a")).toBeUndefined();
    expect(ageBracket(-1)).toBeUndefined();
  });

  it("uses the brackets store-contract.json gives app", () => {
    expect([...AGE_BRACKETS]).toEqual(contract.ageBrackets.values);
  });
});
