# Config

Everything in this repo meant to be tuned by hand, without needing to
read or understand the TypeScript code around it — the answer to "where
do I edit X" for a contributor. One JSON array per file, `stage-action`
named so the file itself says what it does — no generic "overrides"
umbrella hiding five different actions behind one name.

| File                                                         | Stage  | Does                                                                                                                                           |
| ------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`categories-apps.json`](categories-apps.json)               | enrich | freedesktop category → display-label mapping for non-game apps (key order is also preference order, values locked to a closed enum)            |
| [`categories-games.json`](categories-games.json)             | enrich | freedesktop genre tag → display-label mapping for games (key order is also preference order, values locked to a closed enum)                   |
| [`filter-keep.json`](filter-keep.json)                       | filter | rescues a package `filter/rules.ts`'s auto rules would wrongly exclude                                                                         |
| [`filter-exclude.json`](filter-exclude.json)                 | filter | force-excludes a package the auto rules miss                                                                                                   |
| [`match-force.json`](match-force.json)                       | match  | forces every listed source package to merge into one destination, no scoring                                                                   |
| [`match-deny.json`](match-deny.json)                         | match  | forbids a specific pair from ever merging, even if the auto tiers would                                                                        |
| [`enrich-app-store-tags.json`](enrich-app-store-tags.json)   | enrich | **tags** a package as an app-store/package-manager frontend (`CatalogApp.appStoreFrontend`) — doesn't exclude or change anything else about it |
| [`enrich-compat-warnings.json`](enrich-compat-warnings.json) | enrich | attaches a known packaging-format compatibility warning to one specific `{source, name}`                                                       |
| [`enrich-suites.json`](enrich-suites.json)                   | enrich | defines a software-suite relationship (one main app + separately-installable components)                                                       |
| [`category-rules.json`](category-rules.json)                 | enrich | name-pattern → category, for apps with no upstream category signal at all (checked before falling back to "To Classify")                       |

Each file has a matching JSON Schema, colocated with the curator code
that defines it (`src/curator/{filter,match,enrich}/*.schema.json`, not
under `config/` — a schema is a typing artifact, not tunable data) — see
[`.vscode/settings.json`](../.vscode/settings.json) for the mapping. Open
one of the files above in an editor that reads workspace JSON schemas
(VS Code does, out of the box) and you get live autocomplete/validation,
no separate tool needed.

Every `.schema.json` is generated from a Zod schema (`pnpm
generate-schemas`), the same one that validates the file's contents at
load time — `_shared/json.ts`'s `readJson` for the eight override-style
files, a direct parse in `enrich/category.ts` for
`categories-apps.json`/`categories-games.json` (a required base
taxonomy, not an optional override list) — one definition backs the
TS type, the runtime check, and the editor-facing schema, instead of
three things to hand-keep in sync. A malformed entry now fails loud and
points at the exact field right when it's loaded, not as a confusing
bug somewhere downstream. Adding/changing a field means editing the
Zod schema (in the relevant `types.ts`/`*.ts` file, not the generated
`.schema.json`) and re-running `pnpm generate-schemas` — editing just
an _entry_ in one of the files above never needs that.

`sources`/`destination`/`a`/`b` fields always list `PackageSourceId`
values (`<format>-<provider>`, e.g. `"deb-debian"`) — a value only goes
in an entry's `sources` array once it's actually been checked on that
source, never as a blanket "applies everywhere" wildcard, since the same
name can mean something else entirely on a different source (see
`filter/rules.ts`'s many per-distro examples of exactly that).

**Litmus test for `filter-keep.json`**: would a user _launch_ this on
its own? A library, plugin, extension, or engine that needs a separate
host app/frontend to do anything (a libretro core needing RetroArch, a
LibreOffice extension needing LibreOffice, ...) doesn't qualify, even if
it's real, named, well-known software — same treatment as a library, not
an app. Not automatable (no "has a desktop entry" / "ships an executable
meant to be run directly" signal exists in the data model), so this has
to be judged by hand per entry, same as everything else in this folder.

Every entry in the eight override-style files (everything except
`categories-apps.json`/`categories-games.json`) needs a real `reason` so the exception is auditable
later, not just an unexplained line — each one only grows as a real case
is found and verified, never pre-filled speculatively.

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
