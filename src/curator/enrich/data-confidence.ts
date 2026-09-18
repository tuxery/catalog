import { agree as licensesAgree } from "helpers4/license";
import type { SourcedPackage } from "../../sources";
import { stripVariantSuffix } from "../match/group";
import { packageKey, refKey } from "../match/keys";
import { normalizeName } from "../match/normalize";
import type { MatchOverrides } from "../match/overrides";

/**
 * One deterministic signal that moved an app's data-confidence score away
 * from its neutral baseline of 0 — kept alongside the score itself (not
 * just the total) so a low score is auditable rather than a black box,
 * same "store the reason, not just the verdict" discipline as
 * `LlmClassificationEntry.reason` and every hand-verified rule file's own
 * doc comments in this directory.
 */
export interface DataConfidenceSignal {
  signal: string;
  delta: number;
  detail: string;
}

/**
 * `score` is a signed total, not a 0-100 grade — 0 is the neutral
 * baseline every app starts at (most apps, especially single-source
 * ones with nothing to cross-check, stay there: an empty `signals`
 * array is the normal case, not a failure to compute anything).
 * Positive means real corroboration was found; negative means at least
 * one real disagreement was found between member packages that are
 * supposed to be the same app. Deliberately not yet bucketed into
 * "high/medium/low" — that needs real score distributions to calibrate
 * against first (tracked on the Tuxery GitHub Project).
 */
export interface DataConfidence {
  score: number;
  signals: DataConfidenceSignal[];
}

const FORCE_MATCH_BONUS = 30;
const NAME_DISAGREEMENT_PENALTY = -15;
const LICENSE_CONFLICT_PENALTY = -20;
const CORROBORATION_BONUS = 10;

/** Every package key (`refKey`-shaped) that appears in a `config/match-force.json` entry — either as the destination or as one of its listed sources. Computed once per enrich pass (see `enrichApps`), not per app. */
export function forceMatchedKeys(overrides: MatchOverrides): Set<string> {
  const keys = new Set<string>();
  for (const entry of overrides.force) {
    keys.add(refKey(entry.destination));
    for (const ref of entry.sources) keys.add(refKey(ref));
  }
  return keys;
}

function hasLicense(pkg: SourcedPackage): pkg is SourcedPackage & { license: string } {
  return Boolean(pkg.license);
}

/**
 * Computes one app's deterministic data-confidence signals from its
 * member packages alone — no LLM, no network, safe to run on every app
 * in the catalog. A later pass (tracked separately) adds an LLM-derived
 * coherence signal on top of these, piggybacked on the same batched call
 * that arbitrates display fields across sources.
 */
export function computeDataConfidence(
  packages: SourcedPackage[],
  forceKeys: Set<string>,
): DataConfidence {
  const signals: DataConfidenceSignal[] = [];

  if (packages.some((pkg) => forceKeys.has(packageKey(pkg)))) {
    signals.push({
      signal: "force-match-verified",
      delta: FORCE_MATCH_BONUS,
      detail: "This merge is listed in config/match-force.json — a human already verified it.",
    });
  }

  if (packages.length > 1) {
    // Same name equivalence the matcher itself used to justify grouping
    // these packages together (build-variant/channel-word suffixes
    // stripped first) — otherwise a correctly-merged AUR trio like
    // `jan`/`jan-bin`/`jan-git` would read as a name conflict.
    const names = new Set(packages.map((pkg) => normalizeName(stripVariantSuffix(pkg))));
    if (names.size > 1) {
      signals.push({
        signal: "name-disagreement",
        delta: NAME_DISAGREEMENT_PENALTY,
        detail: `Member packages disagree on name: ${[...names].join(" / ")}.`,
      });
    }

    const withLicense = packages.filter(hasLicense);
    const conflicts: string[] = [];
    for (let i = 0; i < withLicense.length; i++) {
      for (let j = i + 1; j < withLicense.length; j++) {
        const a = withLicense[i];
        const b = withLicense[j];
        if (a && b && !licensesAgree(a.license, b.license)) {
          conflicts.push(`${a.source} (${a.license}) vs ${b.source} (${b.license})`);
        }
      }
    }
    if (conflicts.length > 0) {
      signals.push({
        signal: "license-family-conflict",
        delta: LICENSE_CONFLICT_PENALTY,
        detail: `Member packages report conflicting license families: ${conflicts.join("; ")}.`,
      });
    }

    if (names.size <= 1 && conflicts.length === 0) {
      signals.push({
        signal: "multi-source-corroboration",
        delta: CORROBORATION_BONUS,
        detail: `${packages.length} independent sources agree, no disagreement signal found.`,
      });
    }
  }

  const score = signals.reduce((total, signal) => total + signal.delta, 0);
  return { score, signals };
}
