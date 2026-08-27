# AGENTS.md — Tuxery `catalog`

The Tuxery data pipeline: source connectors, the curation engine (filter +
match/merge), the scripts that rebuild the dataset end to end, and the
persisted store the `app` repo (and, later, a public API) read from.

## Language

**All content must be in English** — code, comments, doc-comments, commit
messages, issues, pull requests, and configuration. No exceptions.

## Scope

One plain package (`package.json` at the repo root), folder-scoped rather
than split across several — was originally four (`sources`/`curator`/
`pipeline`/`store`, each its own `package.json`/`tsconfig.json`/
`vitest.config.ts`/`.oxlintrc.json`), collapsed once it became clear the
split bought nothing here: nothing publishes independently (every package
was `private`, `version: 0.0.0`), there's no per-package release cadence,
and the ~16 near-identical config files were pure friction for a
contributor trying to find where to make one change. The `scopes.json`
commit-scope names below (`sources`, `curator`, `pipeline`, `store`) are
unchanged — they're semantic labels for a concern, not proof a package
boundary exists.

- `config/` — hand-edited tuning data, no TypeScript knowledge required to
  change. See [`config/README.md`](config/README.md) for what lives here
  and, just as important, what deliberately doesn't (some of `filter/
rules.ts`'s heuristics carry research context a bare JSON list can't
  hold).
- `docs/` — wiki-style reference docs (one Markdown file per topic), e.g.
  [`docs/sources.md`](docs/sources.md)'s exhaustive source support matrix.
- `src/sources` — normalized `SourcedPackage` type, one subfolder per
  upstream source (`flathub/`, `snapcraft/`, `appimage/`, `aur/`, ...) each
  owning its own cache row type (`types.ts`), `normalize.ts`, and
  `fetch.ts`. `_shared/` holds cross-source helpers (NDJSON read/write).
  `cache/` holds the git-committed NDJSON snapshot per source — see
  "Source cache" below. Every source except GitHub Releases has a real
  `fetch.ts` implemented (e.g. `pnpm refresh flathub`) — see
  [`docs/sources.md`](docs/sources.md) for status per source.
- `src/curator` — catalog curation, pure functions, no I/O. Renamed from
  `matcher` once it grew more than one responsibility. Three stages, in
  order: `filter/` decides which packages belong in the catalog at all
  (drops libraries/dev-headers/docs/fonts — see its own rules +
  git-committed `config/filter-keep.json`/`filter-exclude.json`); `match/`
  groups what's left into unified apps across sources using a union-find
  over exact-match tiers (manual overrides → exact appId → exact
  normalized name — see `match/group.ts`'s doc comment for why there's no
  fuzzy/scored tier on top), with git-committed `config/match-force.json`/
  `match-deny.json` for the cases the auto tiers get wrong; `enrich/`
  turns each group into the display-ready
  `CatalogApp` the website reads — most of its fields are typed but not
  yet populated by any connector, see `enrich/types.ts`'s doc comments and
  the "Populate CatalogApp's rich fields per source" card on the Tuxery
  GitHub Project.
- `src/pipeline` — orchestration scripts that run sources + curator end to
  end and produce a fresh dataset.
- `src/store` — the persisted DB layer (Turso/libSQL) that `app` queries
  at request time via SQL, not a static file fetched at build time.

This repo has no Qwik/UI code — that stays in `tuxery/app`. Keeping the two
separated is deliberate: contributors adding a source connector shouldn't
need to touch the web app, and the pipeline can have its own release/rebuild
cadence (e.g. a scheduled rebuild) independent of when the site deploys.

**Dependency direction is one-way**: `sources` → `curator` → `pipeline`,
with `store` a leaf `pipeline` also depends on. Nothing outside this repo
enforces it any more — the four-package split used to make a backward
import fail at module resolution; a single package can't do that, and
oxlint has no equivalent to eslint-plugin-import's `no-restricted-paths`
to fill the gap (checked — not in its supported rule set). This is a real,
known trade-off of the collapse: the boundary is convention + code review
now, not a build-time guarantee. Don't import `curator` from `sources`, or
`pipeline` from anywhere but `sources`/`curator`/`store`.

## Source cache

`src/sources/cache/<source>.ndjson` is a git-committed snapshot of each
upstream source's raw data (one JSON object per line, typed per source in
that source's own `types.ts` — deliberately _not_ a single shared schema,
since upstream shapes differ). Each source's `index.ts` reads this cache by
default (no network, works offline, safe to run on every push); only a
separate `fetch.ts` hits the real upstream and rewrites the cache file, run
on a schedule rather than per-push — see the "Wire scheduled source
refresh" card on the Tuxery GitHub Project. Committing the cache means
CI/dev never starts from zero and upstream APIs aren't hit on every
rebuild.

Every `fetch.ts` also writes a `cache/<source>.meta.json` sidecar (via
`_shared/metadata.ts`) recording when and from where the data was fetched —
`fetchedAt`, `url`, `entryCount`, plus whatever else is relevant per source
(Flathub's `arch`, Snapcraft's `deviceSeries`/`categoriesSwept`). Kept as a
sibling file rather than fields on every NDJSON row, so a re-fetch's
changed timestamp doesn't touch every data line's diff. `_shared/deb822.ts`
is the one format-parsing helper shared between sources (Debian and
Ubuntu both use it, being the same upstream format) — otherwise each
source's parsing stays local to its own folder even when structurally
similar, so it can be modified independently later.

## Local dev

Three commands, three terminals, mirroring prod (this repo populates and
serves the DB, `app`'s Worker only ever queries it — `app` never starts
database infrastructure itself, the same way you wouldn't start a Spring
Boot server from an Angular CLI command). Two modes, picked independently
by passing `--remote` or not:

- **Local (default)**:
  1. `pnpm seed` (this repo) builds/reuses the dataset and writes it into
     a local libSQL database file. One-shot — writes and exits, no side
     effects beyond that file. Three tiers, cheapest first: reuse
     `dist/dataset.json` if it already exists; else rebuild it from the
     git-committed source caches (`pnpm start`, no network); `pnpm seed
--force` skips both and re-fetches every source fresh first.
  2. `pnpm serve` (this repo) runs a local `turso dev` server (part of
     the Turso CLI) in front of that file — foreground, blocking, its own
     terminal. A Workers isolate can't open a SQLite file directly, so
     this repo (owning the data) is the one that fronts it with a server,
     speaking the same libSQL HTTP protocol `catalog.ts` uses against the
     real hosted DB in prod.
  3. `app`'s `pnpm dev` connects to that server. Unlimited reads/writes,
     no network, for fast iteration.
- **Remote**: `pnpm seed --remote` publishes straight to the real hosted
  Turso dev DB instead (no `pnpm serve` needed — Turso already serves
  it); `app`'s `pnpm dev --remote` points the Worker at it directly. Real
  network latency, real quotas — closer to how prod actually behaves.
  Credentials come from `/workspaces/.dev/.env`
  (`TURSO_DB_URL`/`TURSO_DB_AUTH_TOKEN`), shared with `app`'s side rather
  than duplicated per repo.

`pnpm reset-caches` refreshes `src/sources/cache/*.ndjson` alone, without
rebuilding the dataset or seeding anything, for periodic cache maintenance
decoupled from wanting to dev right now. `pnpm refresh <source>` refreshes
one source by itself (what `reset-caches` calls in a loop, and what
`.github/workflows/refresh-sources.yml` runs on a schedule). `pnpm sample`
regenerates `src/pipeline/dev-sample/dataset.json`, the deterministic
sample `app`'s own dev-worker reads by default — a manual/occasional
maintenance command, not run on every dev boot.

In local mode, the database file lives at this repo's `.turso-state/`
(gitignored) — never under `app`, so no dataset bytes touch that repo's
filesystem, even transiently. Publishing to Turso (`src/store`'s
`createTursoClient`) writes into a fresh `apps_next` table and atomically
renames it over `apps` (`ALTER TABLE ... RENAME`), so a rebuild in
progress — inserting 226k rows takes about a minute — never leaves readers
seeing an empty or half-populated table. Re-running `pnpm seed` while
`pnpm serve` is already running is safe: the swap happens on the file
`pnpm serve` is reading live, no restart needed.

## Rules

- Don't add a local `TODO.md`/`ROADMAP.md` — track work as cards on the
  [Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1) instead
  (per this org's bootstrap instructions).
- Keep `src/sources` and `src/curator` free of Qwik/UI dependencies — `app`
  and any future public API both depend on this repo, not the other way
  around.
- Don't wire real upstream network calls into a `src/sources` connector as
  a side effect of unrelated work — per-source rate limits, caching, and
  error handling need deliberate design (see `flathub/fetch.ts` for the
  established shape), not an incidental implementation.
- Respect the `sources → curator → pipeline` one-way dependency direction
  (see "Scope" above) — nothing enforces it automatically any more, so
  this is on code review.
- Prefer `config/` over a new TypeScript constant for anything a
  non-programmer contributor might reasonably want to tune — but read
  `config/README.md` first: some heuristics belong in code on purpose.

## Commit conventions

Canonical rules live in [`tuxery/.dev`'s AGENTS.md](https://github.com/tuxery/.dev/blob/main/AGENTS.md)
and [`commit-convention.json`](https://github.com/tuxery/.dev/blob/main/commit-convention.json).
Format: `type(scope): <emoji> description`.

### Allowed scopes

Scopes live in [`scopes.json`](./scopes.json) at this repo's root:

| Scope      | Maps to                        |
| ---------- | ------------------------------ |
| `sources`  | `src/sources`                  |
| `curator`  | `src/curator`                  |
| `pipeline` | `src/pipeline`                 |
| `store`    | `src/store`, Turso persistence |
| `docs`     | `docs/`                        |
| `ci`       | `.github/workflows/`           |
| `deps`     | Dependency bumps               |

**Do not use a scope outside this list.** If a new top-level concern is
added, update `scopes.json` (and this table) together.

```text
feat(sources): ✨ wire up the real Flathub search API
feat(pipeline): ✨ add scheduled dataset rebuild script
chore(deps): 📌 pin oxlint to 1.76.0
```

## Git workflow

PoC phase is over — `main` is branch-protected. All work goes through a
feature branch + PR; branch naming is unrestricted. Integrate PRs by
**rebase only** — never a merge commit, never squash.

## License

AGPL-3.0-or-later.
