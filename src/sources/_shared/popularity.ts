/**
 * Turns raw usage counts into `SourcedPackage.popularity` scores: each
 * package's percentile within this source (1 for the most used, close to 0
 * for the least), equal counts sharing the better rank. Counts of zero or
 * less get no score at all, never a fake bottom value. Pure — no I/O.
 */
export function percentileScores(counts: Map<string, number>): Map<string, number> {
  const ranked = [...counts].filter(([, count]) => count > 0).toSorted((a, b) => b[1] - a[1]);
  const scores = new Map<string, number>();
  let tieStart = 0;
  ranked.forEach(([name, count], index) => {
    if (index > 0 && count !== ranked[index - 1]?.[1]) tieStart = index;
    scores.set(name, ranked.length > 1 ? 1 - tieStart / (ranked.length - 1) : 1);
  });
  return scores;
}
