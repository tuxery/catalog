import { describe, expect, it } from "vitest";
import type { AuditApp } from "./audit";
import { buildTriageUserPrompt, parseTriageResults, type TriageItem } from "./triage-prompt";

const app = (id: string, name: string): AuditApp => ({
  id,
  name,
  published: true,
  sources: ["pacman-aur"],
  packageCount: 1,
  shortDescription: `${name} description`,
});

const items: TriageItem[] = [
  {
    signal: "declared-relation",
    key: "forkOf:wine-proton->wine",
    apps: [app("wine-proton", "wine-proton"), app("wine", "Wine")],
    relation: { type: "forkOf", quote: "fork of Wine" },
  },
  {
    signal: "shared-homepage",
    key: "videolan.org/vlc",
    apps: [app("vlc", "VLC"), app("vlc-bin", "vlc-bin")],
  },
];

describe("buildTriageUserPrompt", () => {
  it("numbers items and lists their cards and quotes", () => {
    const prompt = buildTriageUserPrompt(items);
    expect(prompt).toContain('1. declared-relation — "fork of Wine" (forkOf)');
    expect(prompt).toContain("   1) vlc; VLC; pacman-aur; VLC description; ");
  });
});

describe("parseTriageResults", () => {
  it("reads one verdict per judged card of a group, one per item otherwise", () => {
    const text = JSON.stringify({
      results: [
        "1|1|correct|high|Proton is Valve's fork of Wine",
        "2|2|same|medium|the same player | another build",
      ],
    });
    expect(parseTriageResults(text, items)).toEqual([
      {
        n: 1,
        card: 1,
        verdict: "correct",
        confidence: "high",
        reason: "Proton is Valve's fork of Wine",
      },
      {
        n: 2,
        card: 2,
        verdict: "same",
        confidence: "medium",
        reason: "the same player another build",
      },
    ]);
  });

  it("drops a verdict the signal can't take, a card out of range, an unknown confidence or item", () => {
    const text = JSON.stringify({
      results: [
        "1|1|same|high|x",
        "2|1|same|high|x",
        "2|3|same|high|x",
        "2|2|same|sure|x",
        "9|2|same|high|x",
      ],
    });
    expect(parseTriageResults(text, items)).toEqual([]);
  });

  it("throws on text that isn't the JSON shape", () => {
    expect(() => parseTriageResults("not json", items)).toThrow(/JSON/);
  });
});
