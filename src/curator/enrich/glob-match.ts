import { globToRegExp } from "helpers4/string";

/**
 * Caches `compile` by its single string argument. Not `helpers4/function`'s
 * `memoize`: that one builds its key with `JSON.stringify` of the argument
 * list on every call, and these run once per rule per app (tens of millions
 * of calls per dataset build): 14.7 s of a 27 s `enrichApps` went to key
 * building alone (profiled 2026-10-05), enough to time out
 * build-dataset.spec.ts in CI.
 */
export function cachePerPattern<T>(compile: (pattern: string) => T): (pattern: string) => T {
  const cache = new Map<string, T>();
  return (pattern) => {
    let compiled = cache.get(pattern);
    if (compiled === undefined) {
      compiled = compile(pattern);
      cache.set(pattern, compiled);
    }
    return compiled;
  };
}

// A name-pattern matcher runs once per uncategorized app across the whole
// catalog (tens of thousands of calls) against the same fixed rule list
// every time, and compiling a pattern is the expensive part relative to
// the match test itself — so this caches by pattern string, shared
// between `category-rules.ts` (apps) and `game-category-rules.ts`
// (games), rather than recompiling the same RegExp on every call.
// `helpers4/string`'s `globToRegExp` doesn't cache internally.
export const cachedGlobToRegExp = cachePerPattern((pattern: string): RegExp =>
  globToRegExp(pattern, false),
);
