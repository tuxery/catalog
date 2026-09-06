import {
  levenshteinDistance as baseLevenshteinDistance,
  levenshteinSimilarity as baseLevenshteinSimilarity,
} from "helpers4/string";

/**
 * Case-insensitive Levenshtein edit distance — `helpers4/string`'s
 * `levenshteinDistance` defaults to case-sensitive, but package/app name
 * matching here has always ignored case.
 */
export function levenshteinDistance(a: string, b: string): number {
  return baseLevenshteinDistance(a, b, false);
}

/**
 * Case-insensitive normalized similarity in [0, 1] — see
 * `levenshteinDistance` above for why case is folded.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  return baseLevenshteinSimilarity(a, b, false);
}
