import { describe, expect, it } from "vitest";
import { dedupeByKey } from "./dedupe";

describe("dedupeByKey", () => {
  it("keeps the last item seen for each key", () => {
    const items = [
      { name: "a", version: 1 },
      { name: "b", version: 1 },
      { name: "a", version: 2 },
    ];

    expect(dedupeByKey(items, (item) => item.name)).toEqual([
      { name: "a", version: 2 },
      { name: "b", version: 1 },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeByKey<{ name: string }>([], (item) => item.name)).toEqual([]);
  });
});
