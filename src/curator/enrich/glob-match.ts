import { memoize } from "@helpers4/function";

// Compiling a pattern is the expensive part (relative to the match test
// itself), and a name-pattern matcher runs once per uncategorized app
// across the whole catalog (tens of thousands of calls) against the same
// fixed rule list every time — recompiling every pattern's RegExp on every
// call would mean millions of redundant compilations for a set of patterns
// that never changes at runtime. `@helpers4/function`'s `memoize` caches by
// (JSON-stringified) argument, i.e. by pattern string here, so two
// different rules that happen to share a pattern string still share one
// compile. Shared between `category-rules.ts` (apps) and
// `game-category-rules.ts` (games) — same glob dialect, same performance
// need, no reason for two copies.
export const globToRegExp = memoize((pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
});
