# Overrides

Hand-curated exceptions to `@tuxery/curator`'s auto rules, one JSON object
per line (NDJSON — can't hold comments, hence this file). Each entry needs
a `reason` so the exception is auditable later, not just an unexplained
line.

- `keep.ndjson` — packages `filter/rules.ts`'s auto rules would exclude
  but shouldn't be. Shape: `{ "source": "...", "name": "...", "reason": "..." }`.
- `exclude.ndjson` — packages the auto rules miss but shouldn't be in the
  catalog. Same shape.

Both start empty and only grow as real false positives/negatives are
found — not pre-filled speculatively.
