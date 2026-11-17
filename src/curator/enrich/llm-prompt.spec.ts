import { describe, expect, it } from "vitest";
import { APP_CATEGORY_LABEL_VALUES, GAME_CATEGORY_LABEL_VALUES } from "./category";
import {
  buildSystemPrompt,
  buildUserPrompt,
  checkBatchResults,
  describeWithRepository,
  isGenericReason,
  MAX_REASON_LENGTH,
  parseResults,
} from "./llm-prompt";

const reply = (...lines: string[]): string => JSON.stringify({ results: lines });

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt();

  it("names the four types", () => {
    for (const type of ['"game"', '"app"', '"lib"', '"other"']) expect(prompt).toContain(type);
  });

  it("lists every category of both types", () => {
    for (const label of [...APP_CATEGORY_LABEL_VALUES, ...GAME_CATEGORY_LABEL_VALUES]) {
      expect(prompt).toContain(label);
    }
  });

  it("is a stable prefix: no per-request content", () => {
    expect(buildSystemPrompt()).toBe(prompt);
  });
});

describe("buildUserPrompt", () => {
  it("numbers items from 1 and keeps each on one line", () => {
    const text = buildUserPrompt([
      { id: "a", name: "foo|bar", description: "line one\nline two" },
      { id: "b", name: "baz", description: "" },
    ]);
    expect(text).toBe("1|foo/bar|line one line two\n2|baz|");
  });
});

describe("parseResults", () => {
  it("parses type, category, confidence and reason", () => {
    expect(parseResults(reply("1|game|Puzzle|h|Falling blocks", "2|app|Utilities|l|"))).toEqual([
      { n: 1, type: "game", category: "Puzzle", confidence: "high", reason: "Falling blocks" },
      { n: 2, type: "app", category: "Utilities", confidence: "low", reason: "" },
    ]);
  });

  it("parses lib (normalized to library) and other, which take '-' as category", () => {
    expect(parseResults(reply("1|lib|-|h|Python bindings", "2|other|-|m|Icon theme"))).toEqual([
      { n: 1, confidence: "high", reason: "Python bindings", type: "library" },
      { n: 2, confidence: "medium", reason: "Icon theme", type: "other" },
    ]);
  });

  it("drops lib/other with a real category", () => {
    expect(parseResults(reply("1|lib|Developer Tools|h|x", "2|other|Puzzle|h|x"))).toEqual([]);
  });

  it("drops a category that belongs to the other type", () => {
    expect(parseResults(reply("1|app|Puzzle|h|x", "2|game|Utilities|h|x"))).toEqual([]);
  });

  it("drops an unknown type, category or confidence, and a non-numeric n", () => {
    expect(
      parseResults(
        reply(
          "1|tool|Utilities|h|x",
          "1|constructor|Utilities|h|x",
          "2|app|Nope|h|x",
          "3|app|Utilities|z|x",
          "x|app|Utilities|h|x",
        ),
      ),
    ).toEqual([]);
  });

  it("splits an entry holding several newline-separated lines", () => {
    expect(parseResults(reply("1|game|Puzzle|h|x\n2|lib|-|m|y"))).toHaveLength(2);
  });

  it("skips a name echoed after n", () => {
    expect(parseResults(reply("1|ccusage|app|Developer Tools|h|CLI"))).toEqual([
      { n: 1, type: "app", category: "Developer Tools", confidence: "high", reason: "CLI" },
    ]);
  });

  it("keeps a '|' inside the reason", () => {
    expect(parseResults(reply("1|app|Utilities|m|a|b"))[0]?.reason).toBe("a|b");
  });

  it("throws on text that isn't JSON", () => {
    expect(() => parseResults("not json")).toThrow(SyntaxError);
  });
});

const batchResult = (n: number, reason = "x") =>
  ({ n, type: "other", confidence: "high", reason }) as const;

describe("checkBatchResults", () => {
  it("keeps the results of the batch's own lines", () => {
    expect(checkBatchResults([batchResult(1), batchResult(2)], 2)).toEqual([
      batchResult(1),
      batchResult(2),
    ]);
  });

  it("drops a line number outside the batch", () => {
    expect(checkBatchResults([batchResult(0), batchResult(1), batchResult(3)], 2)).toEqual([
      batchResult(1),
    ]);
  });

  it("drops the whole batch when a line number repeats", () => {
    expect(checkBatchResults([batchResult(1), batchResult(2), batchResult(2)], 3)).toEqual([]);
  });

  it("cuts a long reason", () => {
    const [kept] = checkBatchResults([batchResult(1, "y".repeat(500))], 1);
    expect(kept?.reason).toHaveLength(MAX_REASON_LENGTH);
  });
});

describe("buildUserPrompt", () => {
  it("cuts each description to the given length", () => {
    const items = [{ id: "a", name: "foo", description: "x".repeat(400) }];
    expect(buildUserPrompt(items)).toBe(`1|foo|${"x".repeat(160)}`);
    expect(buildUserPrompt(items, 300)).toBe(`1|foo|${"x".repeat(300)}`);
  });
});

describe("describeWithRepository", () => {
  it("adds the repository's description and topics to the app's own", () => {
    expect(
      describeWithRepository("ollie", "Desktop client", {
        description: "Chat with local LLMs through Ollama",
        topics: ["ollama", "llm"],
      }),
    ).toBe("Desktop client / Chat with local LLMs through Ollama / topics: ollama, llm");
  });

  it("drops a description that only repeats the name, or the app's own", () => {
    expect(describeWithRepository("Foo", "foo", { description: "A foo editor" })).toBe(
      "A foo editor",
    );
    expect(describeWithRepository("bar", "A bar tool", { description: "a bar tool " })).toBe(
      "A bar tool",
    );
    expect(describeWithRepository("baz", "", undefined)).toBe("");
  });
});

describe("isGenericReason", () => {
  it("flags a reason that names no content", () => {
    expect(isGenericReason("Desktop application")).toBe(true);
    expect(isGenericReason("Electron desktop app")).toBe(true);
    expect(isGenericReason("CLI tool")).toBe(true);
  });

  it("keeps a reason that says what the app is for", () => {
    expect(isGenericReason("Ollama desktop client")).toBe(false);
    expect(isGenericReason("Pixel art editor")).toBe(false);
  });
});
