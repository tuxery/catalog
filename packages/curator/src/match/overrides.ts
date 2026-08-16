import { fileURLToPath } from "node:url";
import { readNdjson } from "../_shared/ndjson";
import { pairKey, refKey } from "./keys";
import type { MatchOverrideEntry } from "./types";

const MANUAL_PATH = fileURLToPath(
  new URL("../../overrides/manual-matches.ndjson", import.meta.url),
);
const DENY_PATH = fileURLToPath(new URL("../../overrides/deny-matches.ndjson", import.meta.url));

export interface MatchOverrides {
  /** Pairs to force into the same group, applied before any scoring. */
  manual: MatchOverrideEntry[];
  /** Pair keys (see `pairKey`) that must never be unioned by the auto tiers, no matter how well they'd score. */
  denyPairs: Set<string>;
}

/** Loads both override lists (missing files read as empty). */
export function loadMatchOverrides(): MatchOverrides {
  const deny = readNdjson<MatchOverrideEntry>(DENY_PATH);

  return {
    manual: readNdjson<MatchOverrideEntry>(MANUAL_PATH),
    denyPairs: new Set(deny.map((entry) => pairKey(refKey(entry.a), refKey(entry.b)))),
  };
}
