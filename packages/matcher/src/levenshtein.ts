/**
 * Levenshtein edit distance between two strings, case-insensitive.
 * Returns the number of single-character insertions, deletions, or
 * substitutions needed to turn `a` into `b`.
 */
export function levenshteinDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();

  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  let previousRow = Array.from({ length: t.length + 1 }, (_, i) => i);

  for (let i = 0; i < s.length; i++) {
    const currentRow: number[] = [i + 1];
    for (let j = 0; j < t.length; j++) {
      const deletionCost = (previousRow[j + 1] ?? 0) + 1;
      const insertionCost = (currentRow[j] ?? 0) + 1;
      const substitutionCost = (previousRow[j] ?? 0) + (s[i] === t[j] ? 0 : 1);
      currentRow.push(Math.min(deletionCost, insertionCost, substitutionCost));
    }
    previousRow = currentRow;
  }

  return previousRow[t.length] ?? 0;
}

/**
 * Normalized similarity in [0, 1] — 1 means identical, 0 means completely
 * different. Convenience wrapper around `levenshteinDistance` for scoring.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLength;
}
