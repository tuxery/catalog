# Config

Everything in this repo meant to be tuned by hand, without needing to
read or understand the TypeScript code around it — the answer to "where
do I edit X" for a contributor.

- [`overrides/`](overrides/) — hand-curated exceptions to the curator's
  filter/match/enrich stages (see its own `README.md` for the shape of
  each file and when to use it).
- `categories.json` — the freedesktop.org Main Category → display-label
  mapping `enrich/category.ts` uses to assign each app's `category` field.
  Key order is also preference order, for packages that carry more than
  one Main Category (first match wins — see `enrich/category.ts`'s doc
  comment for why `Utility`, freedesktop's generic catch-all, is listed
  last).

Not everything tunable lives here: `filter/rules.ts`'s noise-pattern
lists (dev/debug/doc/library naming conventions, per-distro Section
vocabularies, ...) stay as TypeScript rather than moving to JSON, on
purpose — each one carries a comment with the live-data research behind
it (what was checked, what real exceptions were found and why, what
looked tempting and was rejected and why) that a bare JSON list can't
hold. Moving just the data there would strip the context that stops the
next contributor from re-proposing something already tried and rejected
— worse for maintainability, not better, despite being "simpler." Edit
those directly in `filter/rules.ts`, reading the surrounding comments
first.
