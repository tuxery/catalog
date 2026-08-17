# Sources

Every upstream Linux app source Tuxery could pull from, in priority order.
Goal (probably unreachable, and that's fine): list Linux apps exhaustively.
Status here should stay in sync with the "connector" cards on the
[Tuxery GitHub Project](https://github.com/orgs/tuxery/projects/1) — this
table is the map, the Project is the tracked work.

## Support matrix

| #   | Source                | Component            | Format   | Count   | Exhaustive? | Status      | Notes |
| --- | --------------------- | -------------------- | -------- | ------- | ----------- | ----------- | ----- |
| 1   | Flathub               | —                    | Flatpak  | 3,345   | ✅          | Implemented | [1]   |
| 1b  | Other Flatpak remotes | —                    | Flatpak  | —       | ⚠️          | Not started | [2]   |
| 2   | Snapcraft             | —                    | Snap     | 3,652   | ⚠️          | Implemented | [3]   |
| 3   | AppImage              | —                    | AppImage | 1,052   | ⚠️          | Implemented | [4]   |
| 4   | GitHub Releases       | —                    | Any      | —       | ❌          | Deferred    | [5]   |
| 5a  | AUR (Arch, community) | —                    | Native   | 117,520 | ✅          | Implemented | [6]   |
| 5b  | Arch official         | core                 | Native   | 296     | ✅          | Implemented | [7]   |
| 5b  | Arch official         | extra                | Native   | 14,906  | ✅          | Implemented | [7]   |
| 5b  | Arch official         | multilib             | Native   | 272     | ✅          | Implemented | [7]   |
| 5c  | Debian                | main                 | Native   | 68,755  | ✅          | Implemented | [8]   |
| 5c  | Debian                | contrib              | Native   | 303     | ✅          | Implemented | [8]   |
| 5c  | Debian                | non-free             | Native   | 741     | ✅          | Implemented | [8]   |
| 5c  | Debian                | non-free-firmware    | Native   | 44      | ✅          | Implemented | [8]   |
| 5d  | Ubuntu                | main                 | Native   | 6,487   | ✅          | Implemented | [9]   |
| 5d  | Ubuntu                | universe             | Native   | 66,741  | ✅          | Implemented | [9]   |
| 5d  | Ubuntu                | restricted           | Native   | 858     | ✅          | Implemented | [9]   |
| 5d  | Ubuntu                | multiverse           | Native   | 1,242   | ✅          | Implemented | [9]   |
| 5e  | Fedora                | Everything + updates | Native   | 68,990  | ✅          | Implemented | [10]  |
| 5f  | openSUSE              | oss                  | Native   | 52,482  | ✅          | Implemented | [11]  |
| 5f  | openSUSE              | non-oss              | Native   | 42      | ✅          | Implemented | [11]  |
| 5g  | Alpine                | main                 | Native   | 5,961   | ✅          | Implemented | [12]  |
| 5g  | Alpine                | community            | Native   | 22,678  | ✅          | Implemented | [12]  |
| 5h  | Void                  | main                 | Native   | 14,746  | ✅          | Implemented | [13]  |
| 5h  | Void                  | nonfree              | Native   | 67      | ✅          | Implemented | [13]  |
| 5h  | Void                  | multilib             | Native   | 5,710   | ✅          | Implemented | [13]  |
| 5i  | Other native          | —                    | Native   | —       | ✅          | Roadmap     | [14]  |
| 6   | Nixpkgs               | —                    | Native   | 131,101 | ✅          | Implemented | [15]  |

## Notes on each row

Detail and rationale that used to live in the table itself — moved out
because a paragraph per cell made the table unreadable.

1. **Flathub** — `dl.flathub.org/repo/appstream/x86_64/appstream.xml.gz`,
   the appstream repodata Flatpak clients themselves consume. Single
   gzipped XML file, no auth, no pagination. The canonical catalog —
   exhaustive by construction. `packages/sources/flathub/fetch.ts`.
2. **Other Flatpak remotes** (GNOME nightly, KDE `kdeapps`, Fedora's own
   flatpak remote, ...) — same appstream.xml.gz mechanism per remote,
   different host. Not investigated yet; mostly nightly/testing builds,
   not curated apps, so low priority — Flathub already covers the vast
   majority of published apps.
3. **Snapcraft** — `api.snapcraft.io/v2/snaps/find`
   (`Snap-Device-Series: 16` header). No pagination or sort param (both
   rejected outright as "Bad parameters") — every query caps at ~100
   results. Swept two independent ways and merged by name: `category=`
   across 20 categories (from `api.snapcraft.io/api/v1/snaps/sections`),
   and `q=` for every letter/digit — verified neither sweep subsumes the
   other (1,542 vs. 2,919 unique snaps, only 809 overlapping; union
   3,652). Still an approximation, not a dump — no known way to actually
   enumerate the full store. `packages/sources/snapcraft/fetch.ts`.
4. **AppImage** — [`appimage.github.io/feed.json`](https://appimage.github.io/feed.json)
   (community-curated — not to be confused with the separate,
   bot-gated AppImageHub.com, investigated as a second source and found
   not viable: deprecated API, site now behind bot detection), filtered
   to entries with a GitHub repo link (~3 in 4 of ~1,400). Each repo
   checked for existence via GitHub's API (dropping the ~5% confirmed
   404 — deleted/renamed/private, the feed itself going stale) and, if
   it exists, its real version resolved via the latest GitHub Release
   (86% success on the survivors — the rest exist but have no tagged
   release, e.g. continuous-build-only projects). Needs `GITHUB_TOKEN`
   set (5000 req/hr vs. 60 unauthenticated, ~1,100 repos × 2 calls
   each), skipped entirely otherwise rather than burning the
   unauthenticated budget for nothing. Depends entirely on community
   curation — not every AppImage publisher is listed.
   `packages/sources/appimage/fetch.ts`.
5. **GitHub Releases** (generic; `.deb`, `.rpm`, `.AppImage`, raw
   binaries, ...) — no catalog exists; would need GitHub topic/code
   search heuristics (e.g. `topic:linux-app`) or a curated seed list
   (awesome-lists style). Not exhaustive by nature — scope narrowly
   (topics) rather than attempt to crawl GitHub. Shares plumbing with
   AppImage's per-repo Release lookup. Deferred — not convincing enough
   yet to build; not a package.
6. **AUR** (Arch, community) — `aur.archlinux.org/packages-meta-ext-v1.json.gz`,
   a full metadata dump regenerated every ~5 min, single file, no auth.
   Full dump — the easiest native source to be exhaustive on.
   `packages/sources/aur/fetch.ts`.
7. **Arch official** (core + extra + multilib) —
   `geo.mirror.pkgbuild.com/{repo}/os/x86_64/{repo}.db`, gzipped tar
   archives, one `desc` file per package (`%FIELD%\nvalue\n\n` format,
   not deb822/XML/JSON), extracted via the `tar` npm package. Distinct
   from AUR — pre-built, Arch-team-maintained packages, not community
   build recipes. Exhaustive per repo/arch combination; x86_64 only.
   `packages/sources/arch/fetch.ts`.
8. **Debian** (main + contrib + non-free + non-free-firmware) —
   `deb.debian.org/debian/dists/stable/{component}/binary-amd64/Packages.gz`
   — `.gz`, not the archive's default `.xz` (Node's built-in zlib
   gunzips without a new dependency; Debian publishes both). deb822
   stanza format. Exhaustive per suite/component/arch combination;
   stable/amd64 only — other suites/archs not fetched.
   `packages/sources/debian/fetch.ts`.
9. **Ubuntu** (main + universe + restricted + multiverse) — same deb822
   mechanism as Debian (it's a derivative), resolute (26.04)/amd64
   only. All four components needed, not `main` alone — verified
   against the real archive: `main` alone yielded 6,487 packages,
   adding `universe` brought it to 73,219. Ubuntu's component split is
   by _support tier_ (Canonical vs. community) and legal status, unlike
   Debian's purely license-based split, so most desktop apps live in
   universe. `packages/sources/ubuntu/fetch.ts`.
10. **Fedora** (Everything + updates, merged by name) — two-step per
    repo: `repodata/repomd.xml` first (to find the current
    content-hashed `primary.xml.zst` path — RPM repos don't use a fixed
    filename like Debian's `Packages.gz`), then that file,
    Zstandard-compressed (Node 24's built-in zlib decodes it, no new
    dependency). Fetches both release 44's Everything repo (the frozen
    release-day snapshot) and its updates overlay, merged by name
    (updates wins ties — matches real dnf/yum behavior); x86_64 only,
    other releases not fetched. Merged & deduped by name — Everything
    alone has 76,354 raw rows but only 67,430 unique names (arch/
    subpackage variants sharing a name); updates then adds 1,560
    genuinely new names on top. `packages/sources/fedora/fetch.ts`.
11. **openSUSE** (Tumbleweed, oss + non-oss) — the identical repomd.xml ->
    content-hashed primary.xml[.zst] repodata schema as Fedora (parsing
    shared via `_shared/rpm-repodata.ts`, also used to refactor Fedora's
    own `fetch.ts`), fetched the same way. Two differences from Fedora:
    no per-arch repo directory — each repo's primary.xml already bundles
    every package's `<arch>` in one file (verified: oss's 52,482 entries
    split exactly into x86_64 + noarch, nothing else mixed in, so no
    arch filtering needed) — and oss/non-oss are disjoint components
    rather than overlapping snapshots (verified zero name collisions
    between them), so a plain concatenation replaces Fedora's by-name
    merge/precedence logic. `<rpm:group>` (the same RPM Group field
    Fedora also has but leaves "Unspecified" in practice) is genuinely
    populated on real openSUSE data, 68.7% of the time, with rich
    hierarchical values (e.g. `Development/Libraries/C and C++`) — a
    stronger, richer filter signal than Debian's flat Section vocabulary,
    reused via the same `SourcedPackage.section` slot.
    `packages/sources/opensuse/fetch.ts`.
12. **Alpine** (main + community) — a custom text format
    (`APKINDEX.tar.gz`, extracted the same way as Arch's `.db` archives
    via the `tar` npm package), single-letter field prefixes (`P:name`,
    `V:version`, `T:summary`, `U:homepage`, ...) rather than deb822/RPM-
    XML — no shared parser with any other connector, unlike Fedora/
    openSUSE's `_shared/rpm-repodata.ts`. Unlike every other repo-per-
    release source here, fetched via `latest-stable` — a server-side
    alias that always resolves to the current stable release, so this
    connector doesn't join Fedora/Ubuntu on the "pin a hardcoded release"
    card. main (5,961) + community (22,678) are disjoint, zero name
    collisions verified, so a plain concatenation is enough, same as
    openSUSE's oss/non-oss. Verified APKINDEX has no Section/Group-
    equivalent field at all (full real-schema scan:
    `P/V/A/S/I/T/U/L/o/m/t/c/D/p/i/k` only) — filtering is name-pattern
    only here, same situation as AUR/Arch's `desc` format.
    `packages/sources/alpine/fetch.ts`.
13. **Void** (main + nonfree + multilib) — a genuinely different repodata
    shape from every other native source here: `<arch>-repodata` is a
    Zstandard-compressed tar (no file extension hints either fact)
    containing `index.plist`, an XML property list (Apple/GNUstep
    format) — one `<dict>` per package keyed by pkgname, not deb822, RPM
    XML, or APKINDEX's single-letter text format. Parsed with the `plist`
    npm package rather than hand-rolling a plist walker — the same
    "reach for the standard library for the format" choice as `tar` for
    Arch/Alpine's archives. `pkgver` (e.g. `0ad-0.27.1_6`) is always
    `<pkgname>-<version>_<revision>` by xbps convention, so the version
    is recovered by slicing off the already-known pkgname prefix. main
    (14,746) + nonfree (67) + multilib (5,710, `-32bit`-suffixed 32-bit
    compat packages) are disjoint, zero name collisions verified, same
    pattern as openSUSE's oss/non-oss and Alpine's main/community.
    Verified `index.plist` has no Section/Group-equivalent field at all
    (schema scan: `architecture`, `homepage`, `license`, `maintainer`,
    `pkgver`, `provides`, `run_depends`, `shlib-requires`, `short_desc`,
    `source-revisions`, `sourcepkg` only) — filtering is name-pattern
    only here, same situation as Alpine/AUR/Arch.
    `packages/sources/void/fetch.ts`.
14. **Other native** (Gentoo, Solus, Clear Linux, Slackware) — each has
    its own repodata format, niche enough to be low priority — pick up
    only if/when there's a specific reason to. NixOS/nixpkgs split out to
    its own row (6), openSUSE to row 5f, Alpine to row 5g, Void to row
    5h — see above/below.
15. **Nixpkgs** — `channels.nixos.org/nixos-unstable/packages.json.br`, a
    single continuously-updated channel dump — the closest thing to a
    full-catalog file this codebase has seen (149,121 raw entries, more
    than AUR). The `.br` extension is misleading: the server sends a real
    `Content-Encoding: br` header, and Node's `fetch` transparently
    decompresses it itself — `response.text()` already returns plain
    JSON, no manual `zlib.brotliDecompressSync()` step (unlike Fedora's
    Zstandard handling, which does need one — confirmed by hitting a
    decompression error until this was found). Filtered to `x86_64-linux`
    (149,071 of 149,121) and dropped `broken`/`unavailable` entries
    (32,062 combined) at fetch time — a technical fact, not a curation
    judgment: these genuinely can't be installed today. `pname` alone
    isn't unique (the same library exists under several attribute paths —
    different language-version package sets, mainly: 20,700 of 114,016
    unique `pname`s are used more than once) — the full attribute path is
    the real identifier. `packages/sources/nixpkgs/fetch.ts`.

## Cross-cutting notes

- **Two-stage model per source**: `fetch.ts` (network → `packages/sources/cache/<source>.ndjson`, source-specific row type) and `normalize.ts` (cache → the shared `SourcedPackage` type). Only `fetch.ts` needs implementing per row above — `normalize.ts`, the cache read path, and tests already exist per source (see the root [`AGENTS.md`](../AGENTS.md)'s "Source cache" section).
- **Fetch metadata**: every implemented `fetch.ts` writes a `cache/<source>.meta.json` sidecar — `fetchedAt`, the upstream `url`, `entryCount`, plus source-specific details (Flathub's `arch`, Snapcraft's `deviceSeries`/`categoriesSwept`). See `_shared/metadata.ts`.
- **Matching cost**: `@tuxery/curator`'s `match/group.ts` (formerly the standalone `@tuxery/matcher` package — merged into `curator` alongside the new `filter/` stage) originally bucketed by an 8-char normalized-name prefix before pairwise scoring within each bucket — a mitigation over a naive full pairwise scan, but one whose cost still climbed super-linearly as more sources landed: ~6s at ~123k packages, ~26s at ~192k, ~51s at ~268k, ~111s at ~357k raw, ~35s after `curator/filter` cut the input to ~303k (see the "Matcher bucket sizes growing again" card, now closed). It's since been replaced with a union-find over exact-match tiers — manual overrides → exact `appId` → exact normalized name, each an O(1)-per-package map lookup, no pairwise comparison at all. A fourth, fuzzy/scored tier (`match/score.ts`'s `scoreMatch`, name-distance + appId + icon-filename weights) was considered but turned out to be mathematically unreachable once the two exact tiers run first — with the current weights (name 0.5, appId 0.35, icon 0.15) and a 0.75 threshold, no pair lacking an exact appId or exact name can score above 0.65 — so it was dropped rather than shipped as inert code; `scoreMatch` stays exported for when weights get revisited. Net effect: grouping the filtered ~303k packages now takes well under a second.
- **Scheduled refresh**: `fetch.ts` implementations are meant to run on a cron schedule, not on every push — see the "Wire scheduled source refresh" card on the Tuxery GitHub Project.
- **Catalog filtering**: `@tuxery/curator`'s `filter/` drops packages that look like libraries/dev-headers/docs/fonts/language-ecosystem-modules rather than apps/games, two independent signals: name patterns (`looksLikeSupportPackage`) and the upstream `Section`-equivalent field, when the source has one (`looksLikeSupportSection`, `SourcedPackage.section`) — both verified against real cache data before landing. The `^lib` name prefix has real exceptions (LibreOffice, LibreCAD, Libreddit, ...) rescued by exact name via `overrides/keep.ndjson` rather than by pattern (a `libre*`-prefix allowlist was considered and rejected: 1,208 unique `libre*` names exist, only 25 are real). Debian/Ubuntu's Section signal is deliberately narrow — `libs`/`libdevel`/`oldlibs`/`doc`/`debug`/`introspection`/`gnu-r` only; tempting-looking sections like `python`/`perl`/`golang`/`devel`/`kernel` were checked and rejected, since real standalone tools (black, composer, cliphist, cosign, ...) show up in them too densely to blanket-exclude. Nixpkgs reuses the same `section` slot for its attribute-path namespace prefix (`kdePackages.akregator` -> `kdePackages`) — same discipline applied: verified language/toolchain package sets (R, Haskell, Python, Perl, OCaml, Lua, Ruby, TeX Live, Typst, Qt6, Wine, Godot, PostgreSQL) plus a general `*Plugins`/`*Extensions` suffix pattern (verified safe across ~10 different host-app namespaces), but _not_ a blanket `*Packages` suffix — `kdePackages` and `php83Packages`/`phpPackages` were checked and rejected for the same "real tools mixed in" reason (composer, psalm, akregator, ark). openSUSE reuses the same slot again for its hierarchical `<rpm:group>` value — six exact-match groups (`System/Libraries`, `Documentation/HTML`, `Documentation/Other`, `System/X11/Fonts`, `System/Localization`, `Metapackages`) verified safe (15-60 sampled entries each, one real exception found and allowlisted by name — `seidl`, a monitoring client, not an install-time metapackage); `Development/Libraries/*`/`Development/Languages/*` hit the exact same trap as Debian's devel/python/perl/golang sections (clisp, love, act, typescript, codespell, ... mixed in) and were rejected the same way. Effective on Debian (~54.3%), Ubuntu (~48.9%), Fedora (~54.7%), openSUSE (~43.3%), and Nixpkgs (~80.0%, by far the largest single-source cut — the language-ecosystem long tail dominates nixpkgs even more than Debian); much less so on AUR (~7.4%), Arch official (~17.6%), Alpine (~39.4%), and Void (~32.3%) — the latter two verified to have no Section-equivalent field at all (Alpine's APKINDEX, Void's index.plist), so filtering there is name-pattern only, same situation as AUR/Arch; the gap between them and AUR/Arch (which additionally lack the `-dev`-suffix/soname-versioned naming conventions the pattern rules key off of) comes down to how aggressively each distro's own packaging convention splits `-dev`/`-doc`/`-static`/`lib*`-prefixed subpackages out in the first place. A reverse-dependency-graph signal and AUR's self-declared Keywords field were both investigated as a further AUR/Arch-specific improvement and found not viable (see the "Filter is far less effective on AUR/Arch" card for the full research writeup) — the ticket stays open for a genuinely new idea. `overrides/keep.ndjson` and `exclude.ndjson` (in `packages/curator/overrides/`) are the manual escape hatch on either side; see that directory's `README.md` for the "would a user launch this on its own" litmus test used to decide `keep.ndjson` entries.
