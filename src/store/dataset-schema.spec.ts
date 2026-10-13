import { describe, expect, it } from "vitest";
import { parseTursoDataset } from "./dataset-schema";

const app = (id: string) => ({
  id,
  name: id,
  shortDescription: "",
  dataConfidence: { score: 0, signals: [] },
  packages: [{ source: "flatpak-flathub" }],
  screenshots: ["kept as-is"],
});
const dataset = (apps: unknown[]) => ({ generatedAt: "2026-10-11T09:00:00.000Z", apps });

describe("parseTursoDataset", () => {
  it("accepts a well-formed dataset and keeps fields it doesn't check", () => {
    const parsed = parseTursoDataset(dataset([app("a"), app("b")]));
    expect(parsed.apps).toHaveLength(2);
    expect(parsed.apps[0]?.screenshots).toEqual(["kept as-is"]);
  });

  it("rejects an app with no package, a duplicate id, or a missing generatedAt", () => {
    expect(() => parseTursoDataset(dataset([{ ...app("a"), packages: [] }]))).toThrow(/packages/);
    expect(() => parseTursoDataset(dataset([app("a"), app("a")]))).toThrow(/duplicate app id/);
    expect(() => parseTursoDataset({ apps: [app("a")] })).toThrow(/generatedAt/);
  });

  it("accepts a dataset with or without buildInfo, and rejects a malformed one", () => {
    const buildInfo = {
      catalog: { commit: "35e082b", date: "2026-10-12T21:30:00.000Z" },
      sources: { oldest: "2026-10-10T04:00:00.000Z", newest: "2026-10-12T21:20:11.071Z" },
    };
    expect(parseTursoDataset({ ...dataset([app("a")]), buildInfo }).buildInfo).toEqual(buildInfo);
    expect(parseTursoDataset({ ...dataset([app("a")]), buildInfo: {} }).buildInfo).toEqual({});
    expect(parseTursoDataset(dataset([app("a")])).buildInfo).toBeUndefined();
    expect(() =>
      parseTursoDataset({
        ...dataset([app("a")]),
        buildInfo: { catalog: { commit: "x", date: "yesterday" } },
      }),
    ).toThrow(/date/);
  });

  it("rejects a dataset below the remote floor, but not when seeding locally", () => {
    expect(() => parseTursoDataset(dataset([app("a")]), { minApps: 2 })).toThrow(/floor/);
    expect(parseTursoDataset(dataset([app("a")])).apps).toHaveLength(1);
  });
});
