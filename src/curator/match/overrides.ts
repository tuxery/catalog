import { fileURLToPath } from "node:url";
import { readJson } from "../_shared/json";
import { pairKey, refKey } from "./keys";
import type { ForceMatchEntry, MatchOverrideEntry } from "./types";

const FORCE_PATH = fileURLToPath(new URL("../../../config/match-force.json", import.meta.url));
const DENY_PATH = fileURLToPath(new URL("../../../config/match-deny.json", import.meta.url));

export interface MatchOverrides {
  /** Groups to force into the same app, applied before any scoring. */
  force: ForceMatchEntry[];
  /** Pair keys (see `pairKey`) that must never be unioned by the auto tiers, no matter how well they'd score. */
  denyPairs: Set<string>;
}

/** Loads both override lists (missing files read as empty). */
export function loadMatchOverrides(): MatchOverrides {
  const deny = readJson<MatchOverrideEntry>(DENY_PATH);

  return {
    force: readJson<ForceMatchEntry>(FORCE_PATH),
    denyPairs: new Set(deny.map((entry) => pairKey(refKey(entry.a), refKey(entry.b)))),
  };
}
