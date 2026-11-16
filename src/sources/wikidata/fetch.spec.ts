import { describe, expect, it } from "vitest";
import { collectItems, commonsFileName, type SparqlRow } from "./fetch";

const entity = (id: string) => ({ value: `http://www.wikidata.org/entity/${id}` });
const direct = (id: string) => ({ value: `http://www.wikidata.org/prop/direct/${id}` });
const literal = (value: string) => ({ value });

describe("collectItems", () => {
  it("folds package and detail rows into one sorted entry per item", () => {
    const packages: SparqlRow[] = [
      { item: entity("Q698"), property: direct("P4655"), value: literal("org.mozilla.firefox") },
      { item: entity("Q698"), property: direct("P3454"), value: literal("firefox") },
      { item: entity("Q698"), property: direct("P3454"), value: literal("firefox") },
      { item: entity("Q59"), property: direct("P3442"), value: literal("php") },
      // Not a property we read: skipped.
      { item: entity("Q59"), property: direct("P6931"), value: literal("php") },
    ];
    const entries = collectItems(packages, {
      label: [{ item: entity("Q698"), value: literal("Firefox") }],
      websites: [{ item: entity("Q698"), value: literal("https://www.mozilla.org/firefox/") }],
      logos: [
        {
          item: entity("Q698"),
          value: literal(
            "http://commons.wikimedia.org/wiki/Special:FilePath/Firefox%20logo%2C%202019.svg",
          ),
        },
      ],
    });
    expect(entries).toEqual([
      { qid: "Q59", packages: { P3442: ["php"] } },
      {
        qid: "Q698",
        label: "Firefox",
        packages: { P4655: ["org.mozilla.firefox"], P3454: ["firefox"] },
        websites: ["https://www.mozilla.org/firefox/"],
        logos: ["Firefox logo, 2019.svg"],
      },
    ]);
  });
});

describe("commonsFileName", () => {
  it("decodes the file name of a Special:FilePath IRI", () => {
    expect(commonsFileName("http://commons.wikimedia.org/wiki/Special:FilePath/A%20b.png")).toBe(
      "A b.png",
    );
  });
});
