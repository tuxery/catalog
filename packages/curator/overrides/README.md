# Overrides

Hand-curated exceptions to `@tuxery/curator`'s auto rules, one JSON object
per line (NDJSON — can't hold comments, hence this file). Each entry needs
a `reason` so the exception is auditable later, not just an unexplained
line. All four files start empty and only grow as real cases are found —
not pre-filled speculatively.

## Filter (`filter/rules.ts`)

- `keep.ndjson` — packages the auto rules would exclude but shouldn't be.
  Shape: `{ "source": "...", "name": "...", "reason": "..." }`.
- `exclude.ndjson` — packages the auto rules miss but shouldn't be in the
  catalog. Same shape.

**Litmus test for `keep.ndjson`:** would a user _launch_ this on its own?
A library, plugin, extension, or engine that needs a separate host app/
frontend to do anything (a libretro core needing RetroArch, a LibreOffice
extension needing LibreOffice, ...) doesn't qualify, even if it's real,
named, well-known software — same treatment as a library, not an app.
Not automatable (no "has a desktop entry" / "ships an executable meant to
be run directly" signal exists in the data model), so this has to be
judged by hand per entry, same as everything else in this file.

## Match (`match/group.ts`)

- `manual-matches.ndjson` — pairs to force into the same app regardless of
  score, for cases too ambiguous for the auto tiers. Shape:
  `{ "a": { "source": "...", "appId": "..." }, "b": { "source": "...", "appId": "..." }, "reason": "..." }`.
- `deny-matches.ndjson` — pairs that must never be merged even if the auto
  tiers would. Same shape as `manual-matches.ndjson`.
