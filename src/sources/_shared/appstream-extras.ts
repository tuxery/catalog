import type { AgeRating } from "../types";
import { OARS_INTENSITIES, oarsAttributeAge } from "./oars";

/**
 * AppStream fields the XML (`appstream.ts`) and DEP-11 YAML (`dep11.ts`)
 * parsers both read: content rating, relations and videos. Each parser
 * hands over the same neutral shapes, so the wording lives in one place.
 * Pure — no I/O.
 */

/** One `<requires>`/`<recommends>`/`<supports>` child: `<display_length compare="ge" side="longest">360</display_length>`, or DEP-11's `- display_length: 360` + `side: longest`. */
export interface AppstreamRelation {
  kind: string;
  value: string;
  compare?: string;
  side?: string;
  /** DEP-11/XML `version` of an `<id>` relation. */
  version?: string;
}

export interface AppstreamRelations {
  requires?: AppstreamRelation[];
  recommends?: AppstreamRelation[];
  supports?: AppstreamRelation[];
}

/**
 * An OARS rating as the unified `AgeRating`: `minAge` is the highest
 * minimum age among its attributes (`_shared/oars.ts`) and `value` the
 * strongest intensity any of them declares (`none`, `mild`, `moderate`,
 * `intense`) for the per-source detail. A rating with no attribute at
 * all is a checked app with nothing to declare: `none`, age 0. An
 * attribute with an intensity it doesn't know is ignored, never guessed.
 */
export function summarizeContentRating(attributes: { id: string; value: string }[]): AgeRating {
  const known = attributes.filter(({ value }) => OARS_INTENSITIES.includes(value as never));
  const strongest = Math.max(
    0,
    ...known.map(({ value }) => OARS_INTENSITIES.indexOf(value as never)),
  );
  return {
    system: "OARS",
    value: OARS_INTENSITIES[strongest] as string,
    minAge: Math.max(0, ...known.map(({ id, value }) => oarsAttributeAge(id, value))),
  };
}

const CONTROLS: Record<string, string> = {
  pointing: "mouse or touchpad",
  keyboard: "keyboard",
  console: "text console",
  tablet: "graphics tablet",
  touch: "touch screen",
  gamepad: "gamepad",
  voice: "voice input",
  vision: "vision input",
  "tv-remote": "TV remote",
  camera: "camera",
};

const COMPARISONS: Record<string, string> = {
  eq: "exactly",
  ne: "not",
  lt: "less than",
  gt: "more than",
  le: "at most",
  ge: "at least",
};

const DISPLAY_SIZES = new Set(["xsmall", "small", "medium", "large", "xlarge"]);

function describeComparison(relation: AppstreamRelation, amount: string): string {
  return `${COMPARISONS[relation.compare ?? "ge"] ?? "at least"} ${amount}`;
}

function describeRelation(relation: AppstreamRelation): string | undefined {
  const value = relation.value.trim();
  if (!value) return undefined;
  switch (relation.kind) {
    case "control":
      return CONTROLS[value];
    case "display_length": {
      if (DISPLAY_SIZES.has(value)) {
        return `a display size ${describeComparison(relation, value)}`;
      }
      const side = relation.side === "longest" ? "longest side" : "shortest side";
      return `a screen with its ${side} ${describeComparison(relation, `${value} px`)}`;
    }
    case "internet":
      if (value === "always") return "an internet connection";
      if (value === "first-run") return "internet on first run";
      return value === "offline-only" ? "offline use only" : undefined;
    case "memory":
      return `${describeComparison(relation, `${value} MiB`)} of memory`;
    case "id":
      return relation.version ? `${value} ${relation.version}` : value;
    default:
      return undefined;
  }
}

/**
 * One readable line from an app's `<requires>`/`<recommends>`/`<supports>`:
 * "Requires: keyboard, a screen with its shortest side at least 360 px.
 * Recommends: gamepad." Relations a reader can't act on (kernel,
 * firmware, modalias) are left out; `undefined` when nothing is left.
 */
export function summarizeRelations(relations: AppstreamRelations): string | undefined {
  const sections = (
    [
      ["Requires", relations.requires],
      ["Recommends", relations.recommends],
      ["Supports", relations.supports],
    ] as const
  ).flatMap(([label, list]) => {
    const parts = [...new Set((list ?? []).map(describeRelation).filter(Boolean))];
    return parts.length > 0 ? [`${label}: ${parts.join(", ")}.`] : [];
  });
  return sections.length > 0 ? sections.join(" ") : undefined;
}

/** A video file's container and codec, as AppStream tags it. */
export interface AppstreamVideo {
  url: string;
  container?: string;
  codec?: string;
}

/**
 * The one file of a screenshot's videos a `<video>` tag plays everywhere:
 * H.264 in MP4, else WebM, else the first listed. Streaming-site pages
 * are not files and are left out.
 */
export function pickPlayableVideo(videos: AppstreamVideo[]): string | undefined {
  const files = videos.filter(
    (video) => /^https?:\/\/\S+$/.test(video.url) && /\.(mp4|webm|mkv)(\?|$)/i.test(video.url),
  );
  const h264 = files.find((video) => video.container === "mp4" || /\.mp4(\?|$)/i.test(video.url));
  const webm = files.find((video) => video.container === "webm" || /\.webm(\?|$)/i.test(video.url));
  return (h264 ?? webm ?? files[0])?.url;
}
