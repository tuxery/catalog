import { z } from "zod";
import type { AuditApp, AuditSignal, DeclaredRelationType } from "./audit";

// `pnpm triage-llm` (scripts/triage-llm.ts): an LLM's first opinion on each
// audit suspect, so a human only confirms the ones that matter. Pure —
// prompt building and answer parsing only.

/**
 * How a card relates to its group's main card (the most-reached one) —
 * judged card by card, since one group can hold the same product, its
 * companions and something unrelated at once (mozilla.org: Firefox,
 * firefox-langpacks, ca-certificates-mozilla).
 */
export const CARD_RELATIONS = [
  "same",
  "edition",
  "fork",
  "companion",
  "component",
  "tool",
  "unrelated",
] as const;

/** Signals whose suspect is a group of cards, each judged against the first. */
export const GROUP_SIGNALS = new Set<AuditSignal>(["shared-homepage", "same-name"]);

/** The verdicts a suspect of each signal can get — the review page's own buttons, so a suggestion can be accepted as is. */
export const TRIAGE_VERDICTS = {
  "shared-homepage": CARD_RELATIONS,
  "same-name": CARD_RELATIONS,
  megagroup: ["split", "fine"],
  "hidden-app": ["show", "hide"],
  "declared-relation": ["correct", "wrong-target", "none"],
} as const satisfies Record<AuditSignal, readonly string[]>;

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
  /** 1-based card the verdict is about: the judged card in a group (2 and up), 1 otherwise. */
  card: number;
  verdict: string;
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

Each item is one suspect of a kind, with the cards involved, numbered (id; name; sources; description; homepage):
- shared-homepage or same-name: cards that share a project homepage or a name. Card 1 is the group's main card. Judge EACH OTHER card against card 1, one answer per card: "same" (the same software, should be on card 1's card, including a different build), "edition" (a parallel line or maturity of card 1), "fork", "companion", "component", "tool" (as defined above), or "unrelated".
- declared-relation: card 1's own description states a relation to card 2 (quoted). Answer about card 1: "correct" when the statement is right about that exact card 2, "wrong-target" when the relation is real but card 2 is another product of that name, "none" when the words don't state a relation.
- hidden-app: card 1 is hidden as not being an app (a library, data, ...), though a package declares an app. Answer about card 1: "show" when it is software a person would install and launch, "hide" otherwise.

Running on, or being packaged with, a platform or runtime (Wine, Proton, Electron, Java, a web browser) is not a relation: a Windows program shipped with Wine is not a Wine client, and an app built on Electron is not tied to Electron.

Judge from the names, descriptions and homepages given; when they don't settle it, say so with a low confidence rather than guessing.

Answer with JSON {"results": [string, ...]}: "n|card|verdict|confidence|reason" — n the item number, card the card the verdict is about (2, 3, ... for each other card of a group; 1 for declared-relation and hidden-app), confidence high, medium or low, reason under 15 words without "|". A group of k cards gets k-1 strings.`;
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

/** Cards shown per suspect — the review page lists 12. */
export const MAX_CARDS = 12;

export function buildTriageUserPrompt(items: readonly TriageItem[]): string {
  return items
    .map((item, index) => {
      const head = `${index + 1}. ${item.signal}${item.relation ? ` — "${item.relation.quote}" (${item.relation.type})` : ""}`;
      const cards = item.apps
        .slice(0, MAX_CARDS)
        .map((app, card) => `   ${card + 1}) ${describeApp(app)}`);
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
    const [nText, cardText, verdict, confidence, ...reason] = line
      .split("|")
      .map((part) => part.trim());
    const n = Number(nText);
    const card = Number(cardText);
    const item = items[n - 1];
    if (!item || !verdict || !confidence) continue;
    const group = GROUP_SIGNALS.has(item.signal);
    const cards = Math.min(item.apps.length, MAX_CARDS);
    if (!Number.isInteger(card) || (group ? card < 2 || card > cards : card !== 1)) continue;
    const allowed: readonly string[] = TRIAGE_VERDICTS[item.signal];
    if (!allowed.includes(verdict) || !(CONFIDENCES as readonly string[]).includes(confidence)) {
      continue;
    }
    results.push({
      n,
      card,
      verdict,
      confidence: confidence as TriageResult["confidence"],
      reason: reason.join(" ").slice(0, 200),
    });
  }
  return results;
}

const SuggestionSchema = z.object({
  signal: z.string(),
  key: z.string().describe("The suspect's key, as the audit report lists it."),
  appId: z
    .string()
    .optional()
    .describe("For a group suspect: the card judged against the group's main card."),
  verdict: z.string(),
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
