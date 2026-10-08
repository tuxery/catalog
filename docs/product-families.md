# Product families

How Tuxery decides what is one product (one card), what is a choice
inside that product, and what is a link between two products. This is
the vocabulary every connector, curator stage, store column and app
label uses — change it here first, then in code.

Tracked on the [Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1)
card "Product families: fold builds/editions under one card, link forks
(alternatives) and companions (add-ons/extensions)".

## Why

A search for `firefox` returned 61 cards on the live site (2026-10-07):
Firefox itself, but also its AUR builds (`firefox-vaapi`, `-bin`,
`-opensuse-bin`), its Developer Edition once per source, extensions
(`firefox-extension-*`, `firefox-clearurls`), native-messaging hosts,
config scripts and tools working on Firefox's data. Across the whole
dataset, 13,593 of 103,816 apps are named `<another app>-<something>`.

The old model had one axis for all of this, `SourcedPackage.channel`,
which ended up holding a maturity (`beta`, `nightly`), a build method
(`bin`) and a packaging detail (`unwrapped`) side by side.

## Vocabulary

| Term           | Question it answers                | Lives on                   | Seen by the user as                         |
| -------------- | ---------------------------------- | -------------------------- | ------------------------------------------- |
| **Product**    | What is this software?             | `CatalogApp`               | One card, one detail page                   |
| **Track**      | Which parallel line?               | each package               | A choice ("Edition"), only if more than one |
| **Risk**       | How mature?                        | each package               | A choice ("Version"), only if more than one |
| **Flavor**     | Which technical variant?           | each package (`flavors[]`) | Folded "other builds", for niche needs      |
| **Provenance** | Who built what I install?          | each package               | A trust badge, never a choice               |
| **Companion**  | What adds to this product?         | the parent product         | An "Add-ons" list on the parent's page      |
| **Relation**   | Which other product is it tied to? | both products (an edge)    | A "Related" list linking to the other card  |

`channel` is gone.

### Version

Plain data on each package, never a choice axis. Different versions
across sources are lag (a future "outdated" hint); different versions
across risks follow from the risk; maintained parallel lines are
tracks. An old release frozen on purpose and no longer maintained
(`firefox-34-bin`) is the `pinned` flavor, shown with a warning.

### Track

A parallel line with its own lifecycle, that does not merge back into
another line: Firefox `esr` and `devedition`, JDK `17`/`21`, Python
`3.12`, Node `22`, Snap tracks (`v11`, `latest`). Every package has one;
`default` when nothing says otherwise.

### Risk

Maturity inside a track: `stable` · `candidate` · `beta` · `nightly` ·
`git` (built from the development branch head). Something that becomes
the next stable release is a risk, not a track — Firefox Beta and
Nightly are risks; ESR is a track.

### Flavor

A variant of the same release that changes how it is built or
packaged, not what it is: `bin` (prebuilt upstream binary repackaged),
`appimage`, `unwrapped` (nixpkgs), a patch set (`vaapi`, `globalmenu`,
`opensuse`), build options (`nox`, `gtk2`), the locale of a full build
(`locale:de`), a 32-bit build, an old release frozen on purpose
(`pinned`). Zero or more per package.

### Provenance

Who produced the binaries:

| Value               | Meaning                                                 | Default for                                       |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| `upstream`          | The project or vendor itself                            | Flathub verified apps, `vendor-repos`             |
| `distro`            | A distribution rebuilt it from source                   | Distro repos (Debian, Fedora, Arch, nixpkgs, ...) |
| `community-repack`  | A community packager repackaged upstream's own binaries | AUR `-bin`                                        |
| `community-patched` | A community packager built it with extra patches        | AUR drop-in builds carrying a patch flavor        |

Sources whose default is not obvious (AppImage, Snapcraft, unverified
Flathub apps, GOG, Lutris) are left unset until a per-source signal is
checked against real data — unset means "unknown", never `upstream`.

A flag, not a filter — same decision as the "Official vs
unofficial/community provenance flag" card: unofficial builds stay
installable, the user just sees who built them.

### Companion

Something that is not usable on its own and extends one product. Kinds:
`extension` (browser/editor extension, desktop-shell extension),
`plugin`, `theme`, `localization` (language packs), `data`
(dictionaries, databases, content packs), `native-host`
(native-messaging hosts), `config` (policy files, hardening scripts,
symlink shims). Companions are listed on their parent's page only — not
cards, not in search results, not in browse grids. Dedicated browse
sections (Extensions, Themes, ...) are a later project.

A package with no identifiable parent stays what it is today: an app if
it is one, excluded if it is not.

### Relation

A typed edge between two products, each with evidence, an origin
(`formal` · `rule` · `curated` · `llm-reviewed`) and a confidence:

| Type        | Meaning                                                | Example                            |
| ----------- | ------------------------------------------------------ | ---------------------------------- |
| `forkOf`    | A different project started from the other's code      | LibreWolf, ungoogled-chromium      |
| `replaces`  | Declared successor                                     | goldendict-ng → goldendict         |
| `wrapperOf` | An unofficial client or wrapper around another product | claude-tauri-desktop → Claude      |
| `partOf`    | A component of a suite (replaces `CatalogApp.suite`)   | LibreOffice Writer → LibreOffice   |
| `toolFor`   | A standalone app working on another app's data         | firefox-decrypt, profile launchers |

Both directions are stored, so each page reads its own edges without a
second query. "Alternatives" in the sense of "same need, unrelated
code" (GIMP ↔ Krita) are not stored per pair; they belong to the
"Define alternative apps/games selection logic" card.

## Signals

Rule shared with every heuristic in this repo: never fold, attach or
link without a verifiable signal. In order of strength:

1. **Formal metadata from the source**, captured in the caches:
   - AUR/Arch: `packageBase`, `provides`, `conflicts`, `replaces`, `depends`.
   - Debian family: `source`, `provides`, `enhances`, `depends`.
   - RPM (Fedora, openSUSE): `sourcerpm`, `provides`, `obsoletes`, `supplements`.
   - AppStream (Flathub, AppCenter, `*-appstream`): component type, `extends`, `replaces`.
   - nixpkgs attribute path (`vimPlugins.*`, `gnomeExtensions.*`), Gentoo category (`app-vim/*`, `x11-themes/*`).
2. **Curated config** for the cases signals cannot settle: tracks of
   well-known products (`config/families.json`), relations
   (`config/relations.json`).
3. **Name conventions** (`-git`, `-bin`, `-beta`, `-esr`, version
   suffixes) — a fallback, and a corroboration for formal signals.
4. **LLM classifications** — corroboration only (e.g. `type: other`
   supports a companion verdict); relation suggestions from an LLM are
   reviewed and committed to config before use.

### `provides` + `conflicts` means "drop-in replacement", not "same project"

29% of the AUR (35,380 of 121,529 packages, 2026-10-08) declares
`provides=X` and `conflicts=X`. For Firefox that is exactly the builds
to fold (`firefox-bin`, `-vaapi`, `-pure`, `-opensuse-bin`). But the
same signal also comes from forks (`ungoogled-chromium` provides
`chromium`, `goldendict-ng` provides `goldendict`) and from shims
(`neovim-symlinks` provides `vim`). So:

- folded as a flavor of X only when the name is also `X-<suffix>` and
  the suffix is not a fork marker (`-ng`, `-ce`, `-classic`, ... — kept
  in config);
- otherwise a candidate `forkOf`/`replaces` relation, which needs a
  curated entry or a second signal.

## Determination per axis

| Axis       | Signals                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Risk       | Name words (`-beta`, `-nightly`, `-git`, ...), Snap risk, Flathub branch, Gentoo keywords                  |
| Track      | `config/families.json`, `-esr`/`-lts` names, version-suffixed names (`openjdk-17`), Snap track             |
| Flavor     | `-bin`/`-appimage`/`-unwrapped`, suffix of a folded drop-in build, locale suffix of a full build           |
| Provenance | Per-source default (table above), refined by flavor (`bin` → repack, patch flavor → patched)               |
| Companion  | AppStream `extends`, Debian `enhances`, `depends` on the parent + name, nixpkgs namespace, Gentoo category |
| Relation   | `replaces`/`obsoletes`, non-folded `provides`+`conflicts`, `config/relations.json`                         |

## Storage

No new table and no extra rows — the Turso write and read quotas are
the binding constraint (see `src/store/turso-client.ts`). On `apps`:

- `packages_json` carries `track`, `risk`, `flavors`, `provenance` per
  package;
- `companions_json` — compact list on the parent (name, kind, source,
  short description);
- `relations_json` — both directions, precomputed.

Folding builds and moving companions under their parent lowers the row
count. Companions become rows only when dedicated browse sections need
them.

## Decisions

- Editions such as Firefox ESR or Developer Edition are tracks of the
  same product, not separate cards.
- Community-patched builds are folded under the official product, with
  a provenance badge.
- Full `depends` lists are kept in the committed caches (AUR: +6.4 MB on
  26.3 MB, plus 3.6 MB for the other relational fields): reusable for
  later features, and filtering at fetch time would throw away data the
  curator may need.
- Repology's normalization rules (GPL-3.0) are a reference to audit our
  grouping against, not imported data.
- Snap's full channel map, Flathub's beta repo and the nixpkgs stable
  channel fit this model but are not fetched as part of it — each has
  its own card.
