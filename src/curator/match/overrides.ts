import { fileURLToPath } from "node:url";
import { unorderedPairKey } from "helpers4/string";
import { readJson } from "../_shared/json";
import { refKey } from "./keys";
import {
  MatchDenyListSchema,
  MatchForceListSchema,
  MatchTracksListSchema,
  type ForceMatchEntry,
  type MatchTrackEntry,
} from "./types";

const FORCE_PATH = fileURLToPath(new URL("../../../config/match-force.json", import.meta.url));
const DENY_PATH = fileURLToPath(new URL("../../../config/match-deny.json", import.meta.url));
const TRACKS_PATH = fileURLToPath(new URL("../../../config/match-tracks.json", import.meta.url));

export interface MatchOverrides {
  /** Groups to force into the same app, applied before any scoring. */
  force: ForceMatchEntry[];
  /** Pair keys (see `unorderedPairKey`) that must never be unioned by the auto tiers, no matter how well they'd score. */
  denyPairs: Set<string>;
  /** Curated parallel lines of a product, merged into it and labeled — see `config/match-tracks.json`. */
  tracks?: MatchTrackEntry[];
}

/** Loads every override list (missing files read as empty). */
export function loadMatchOverrides(): MatchOverrides {
  const deny = readJson(DENY_PATH, MatchDenyListSchema);

  return {
    force: readJson(FORCE_PATH, MatchForceListSchema),
    denyPairs: new Set(deny.map((entry) => unorderedPairKey(refKey(entry.a), refKey(entry.b)))),
    tracks: readJson(TRACKS_PATH, MatchTracksListSchema),
  };
}
