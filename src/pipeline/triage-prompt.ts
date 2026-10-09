import { z } from "zod";
import type { AuditApp, AuditSignal, DeclaredRelationType } from "./audit";

// `pnpm triage-llm` (scripts/triage-llm.ts): an LLM's first opinion on each
// audit suspect, so a human only confirms the ones that matter. Pure —
// prompt building and answer parsing only.

/** The verdicts a suspect of each signal can get — the review page's own buttons, so a suggestion can be accepted as is. */
export const TRIAGE_VERDICTS = {
  "shared-homepage": ["same", "related", "distinct"],
  "same-name": ["same", "related", "distinct"],
  megagroup: ["split", "fine"],
  "hidden-app": ["show", "hide"],
  "declared-relation": ["correct", "wrong-target", "none"],
} as const satisfies Record<AuditSignal, readonly string[]>;

/** What "related" means, when it's the verdict. */
export const RELATED_KINDS = ["edition", "fork", "companion", "component", "tool"] as const;

const CONFIDENCES = ["high", "medium", "low"] as const;

export interface TriageItem {
  signal: AuditSignal;
  key: string;
  apps: AuditApp[];
  relation?: { type: DeclaredRelationType; quote: string };
}

export interface TriageResult {
  /** 1-based position in the batch. */
  n: number;
  verdict: string;
  kind?: (typeof RELATED_KINDS)[number];
  confidence: (typeof CONFIDENCES)[number];
  reason: string;
}

export function buildTriageSystemPrompt(): string {
  return `You review possible mistakes in Tuxery, a catalog of Linux software built from many package sources (Flathub, Snap, AppImage, AUR, Debian, Ubuntu, Fedora, Arch, nixpkgs, ...).

Tuxery's model: one PRODUCT per piece of software, on one card. Its card folds every package of that software across sources, including its builds (prebuilt -bin, -git snapshots, AppImages, patched builds, 32-bit, language builds) and its editions or release lines (ESR, LTS, beta, nightly, version-numbered lines). Different projects are different products, linked to each other:
- edition: a parallel line or maturity of the same product (Firefox ESR, Chrome Dev, Node 22).
- fork: a different project started from the other's code (LibreWolf from Firefox).
- companion: not usable alone, extends the other (extension, plugin, theme, language pack, data pack).
- component: a separately packaged part of the same project (a -client, -server, -data or -gui package of it).
- tool: a standalone app that works with or on the other (a GUI frontend, a launcher, a manager).

Each item is one suspect of a kind, with the cards involved (id; name; sources; description; homepage):
- shared-homepage or same-name: cards that share a project homepage or a name. Answer "same" when they are the same software (they should be one card, including a different build or an edition), "related" when they are different products tied by one of the links above (give its kind), "distinct" when they are unrelated.
- declared-relation: a card's own description states a relation to another card (quoted). Answer "correct" when the statement is right about that exact target card, "wrong-target" when the relation is real but the target card is another product of that name, "none" when the words don't state a relation.
- megagroup: one card holding packages of several products. Answer "split" when it mixes different software, "fine" when it is all one product.
- hidden-app: a card hidden as not being an app (a library, data, ...), though a package declares an app. Answer "show" when it is software a person would install and launch, "hide" otherwise.

Running on, or being packaged with, a platform or runtime (Wine, Proton, Electron, Java, a web browser) is not a relation: a Windows program shipped with Wine is not a Wine client, and an app built on Electron is not tied to Electron.

Judge from the names, descriptions and homepages given; when they don't settle it, say so with a low confidence rather than guessing.

Answer with JSON {"results": [string, ...]}, one string per item: "n|verdict|kind|confidence|reason" — n the item number, kind one of edition, fork, companion, component, tool when the verdict is "related" and empty otherwise, confidence high, medium or low, reason under 15 words without "|".`;
}

function describeApp(app: AuditApp): string {
  return [
    app.id,
    app.name,
    app.sources.join(","),
    app.shortDescription.replaceAll(/\s+/g, " ").slice(0, 140),
    app.homepage ?? "",
  ].join("; ");
}

export function buildTriageUserPrompt(items: readonly TriageItem[]): string {
  return items
    .map((item, index) => {
      const head = `${index + 1}. ${item.signal}${item.relation ? ` — "${item.relation.quote}" (${item.relation.type})` : ""}`;
      const cards = item.apps.slice(0, 8).map((app) => `   - ${describeApp(app)}`);
      return [head, ...cards].join("\n");
    })
    .join("\n");
}

/**
 * Reads an answer's result lines against the batch they answer: a line
 * with an item number out of range, a verdict that item's signal can't
 * take, or an unknown confidence is dropped. Throws when the text isn't
 * the JSON shape at all (the rotation then counts the model as
 * unavailable for this batch).
 */
export function parseTriageResults(
  text: string | undefined,
  items: readonly TriageItem[],
): TriageResult[] {
  const parsed = JSON.parse(text ?? "") as { results?: unknown };
  if (!Array.isArray(parsed.results)) throw new Error("no results array");

  const results: TriageResult[] = [];
  for (const line of parsed.results) {
    if (typeof line !== "string") continue;
    const [nText, verdict, kind, confidence, ...reason] = line
      .split("|")
      .map((part) => part.trim());
    const n = Number(nText);
    const item = items[n - 1];
    if (!item || !verdict || !confidence) continue;
    const allowed: readonly string[] = TRIAGE_VERDICTS[item.signal];
    if (!allowed.includes(verdict) || !(CONFIDENCES as readonly string[]).includes(confidence)) {
      continue;
    }
    const relatedKind = (RELATED_KINDS as readonly string[]).includes(kind ?? "")
      ? (kind as TriageResult["kind"])
      : undefined;
    results.push({
      n,
      verdict,
      ...(verdict === "related" && relatedKind ? { kind: relatedKind } : {}),
      confidence: confidence as TriageResult["confidence"],
      reason: reason.join(" ").slice(0, 200),
    });
  }
  return results;
}

const SuggestionSchema = z.object({
  signal: z.string(),
  key: z.string().describe("The suspect's key, as the audit report lists it."),
  verdict: z.string(),
  kind: z.enum(RELATED_KINDS).optional(),
  confidence: z.enum(CONFIDENCES),
  reason: z.string(),
  model: z.string().describe("The LLM that suggested it (config/llm-models.json id)."),
});

export type TriageSuggestion = z.infer<typeof SuggestionSchema>;

export const TriageSuggestionsListSchema = z.array(SuggestionSchema).meta({
  title: "Audit: LLM triage suggestions",
  description:
    "An LLM's first opinion on each audit suspect (`pnpm triage-llm`) — shown on the review page beside human verdicts, never applied as is. Generated, not hand-edited.",
});
