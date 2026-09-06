import { memoize } from "helpers4/function";
import { globToRegExp } from "helpers4/string";

// A name-pattern matcher runs once per uncategorized app across the whole
// catalog (tens of thousands of calls) against the same fixed rule list
// every time, and compiling a pattern is the expensive part relative to
// the match test itself — so this memoizes by pattern string, shared
// between `category-rules.ts` (apps) and `game-category-rules.ts`
// (games), rather than recompiling the same RegExp on every call.
// `helpers4/string`'s `globToRegExp` doesn't cache internally.
export const cachedGlobToRegExp = memoize((pattern: string): RegExp =>
  globToRegExp(pattern, false),
);
