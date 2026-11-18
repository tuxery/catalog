# Categories

Every app in the catalog has exactly one category, and every game one
genre: `CatalogApp.category`, always set, "To Classify" when nothing
says what it is. Apps and games use two separate closed lists
(`APP_CATEGORY_LABEL_VALUES` and `GAME_CATEGORY_LABEL_VALUES` in
`src/curator/enrich/category.ts`): a category only means something
together with its type. The label is also the category's id: `app` links
to `/browse/?category=<label>`.

Most categories also have a second level, the subcategory
(`CatalogApp.subcategory`, see [Subcategories](#subcategories)): Developer
Tools > Version Control, Board & Cards > Chess & Go. It is set only when a
rule recognizes the app; the others are listed under their category
alone.

## App categories

| Category                 | What goes there                                                        | Main signals                                                                                   |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Web Browsers             | browsers, their forks and extensions                                   | `WebBrowser`, Gentoo `www-client`, openSUSE `Web/Browsers`, refinements                        |
| Messaging & Calls        | chat, instant messaging, IRC, Matrix/XMPP, VoIP, video calls           | `InstantMessaging`, `Chat`, `IRCClient`, `Telephony`, `VideoConference`, `net-im`, refinements |
| Email                    | mail clients, mail servers and mail tools                              | `Email`, Debian `mail`, Gentoo `mail-*`/`net-mail`, openSUSE `Email/*`, refinements            |
| Social Media             | clients and front ends for Mastodon, Bluesky, Reddit, Lemmy, Nostr ... | refinements only (no freedesktop key exists)                                                   |
| File Sharing & Downloads | torrents, P2P, download managers, FTP, file transfer, cloud sync       | `FileTransfer`, `P2P`, Gentoo `net-p2p`/`net-ftp`, refinements                                 |
| Networking               | network tools and servers, DNS, proxies, remote connections, radio     | `Network`, Debian `net`/`web`/`comm`/`hamradio`, Gentoo `net-*`/`www-*`                        |
| Gaming Tools             | emulators of game systems, game launchers, mod managers, Proton/Steam  | `GameTool`, Gentoo `games-util`/`games-emulation`, `proton*`/`steam*` names, refinements       |
| AI                       | AI assistants, LLM chat clients, local model runners, image generators | refinements only (no freedesktop key exists)                                                   |
| Developer Tools          | IDEs, compilers, debuggers, build and VCS tools                        | `Development`, Debian `devel`, Gentoo `dev-*`                                                  |
| System Tools             | monitoring, disks, drivers, terminals, package managers, backups       | `System`, Debian `admin`, Gentoo `sys-*`                                                       |
| Desktop & Settings       | window managers, panels and bars, launchers, themes, settings panels   | `Settings`, `DesktopSettings`, desktop sections, refinements                                   |
| Security                 | passwords, encryption, VPN, antivirus, pentesting                      | `Security`, Gentoo `app-crypt`/`net-vpn`                                                       |
| Utilities                | small helpers that fit nowhere else                                    | `Utility`, Debian `utils`                                                                      |
| Productivity             | office suites, notes, to-do, PDF, calendars                            | `Office`, `Calendar`                                                                           |
| Business, Finance        | ERP, CRM, invoicing; accounting, budgeting, crypto wallets             | `ContactManagement`; `Finance`                                                                 |
| Graphics & Design        | drawing, image editing, 3D, CAD                                        | `Graphics`                                                                                     |
| Photo & Video            | viewing, editing, recording and playing photos and video               | `Photography`, `Video`                                                                         |
| Music & Audio            | players, editors, synths, audio tools                                  | `Audio`, `Music`                                                                               |
| Education, Science       | learning; science, engineering, maths                                  | `Education`; `Science`                                                                         |
| Books & Reference        | e-book readers, dictionaries, documentation                            | `Literature`, `Dictionary`                                                                     |
| News & Weather           | news and feed readers, weather                                         | `News`, `Feed`                                                                                 |
| Travel & Navigation      | maps, GPS, route planning                                              | `Maps`                                                                                         |

The first six are the split of what used to be one "Internet &
Communication" category: 8,794 apps (2026-11-16) where Firefox,
Thunderbird, Discord, qBittorrent and Wireshark sat side by side.
Flathub ("Networking" with subcategories), GNOME Software ("Socialize"
apart from "Work") and the mobile stores (Google Play's "Communication"
and "Social", Apple's "Social Networking") all draw these lines.

The AI category holds apps that are AI first: assistants and chatbots,
chat clients and front ends for ChatGPT, Claude, DeepSeek, Ollama and
the like, local model runners and inference servers (llama.cpp, LM
Studio, the inference snaps), and AI image and video generators (Stable
Diffusion, ComfyUI). The label is "AI", the owner's own word for it,
short in a URL (`?category=AI`) and as broad as what it holds, which
"AI Assistants" or "AI Tools" would not be. Freedesktop has no key for
it (`ArtificialIntelligence` is a Science subcategory, carried by
machine-learning workbenches such as Orange, and stays Science), so two
refinements file these apps, out of whatever broad category they landed
in (Networking, Productivity, Utilities, System Tools, Messaging &
Calls, Developer Tools...). What stays where it is:

- an app with an AI feature: "an SSH client with an AI assistant", "a
  video editor with local AI", a markdown editor powered by Ollama;
- speech and translation tools (a Whisper transcriber is an audio tool,
  an LLM translator a reference one), add-ons of another program (a Vim
  or Thunderbird plugin, an MCP server);
- anything built around AI coding agents (Claude Code, Codex, their
  GUIs, sandboxes and kanban boards), and, in Developer Tools, anything
  that names code, an API, an SDK, a library or an integration: a coding
  agent is a developer tool, as a code editor with an AI feature is a
  code editor.

A third refinement moves an LLM verdict of AI back to Developer Tools
when the app is a coding agent, its GUI or dashboard, or an agent
framework: the model files some there although the prompt says
otherwise.

AUR keywords (`ai`, `llm`, `ollama`, `chatgpt`) were sampled as a signal
and left out: a clipboard manager, a note-taking app and a network
tunnel tool carry them for an optional feature.

## Game genres

Action, Shooter, Adventure, Visual Novel, Arcade, Music & Rhythm, Board &
Cards, Puzzle, Educational, Role-Playing, Simulation, Racing, Sports,
Strategy.

- **Shooter** has its own freedesktop key (`Shooter`), Lutris and GOG
  genres, and is a genre of its own on Steam, IGDB and GOG.
- **Racing**, **Music & Rhythm** and **Visual Novel** have none:
  Lutris/GOG genres map to the `X-Racing`, `X-Rhythm` and `X-VisualNovel`
  extension keys (`src/sources/{lutris,gog}/normalize.ts`), and a game's
  own description moves it there through a refinement.
- **Not genres here**: _Casual_ describes an audience, not a kind of
  game (Google Play's "Casual" mixes puzzle, idle and match-3 games), so
  there is no Casual genre and no "Casual games" row; _Casino_ games are
  card games (Board & Cards); _Word_ and _Trivia_ games are puzzles (57
  of them, 2026-11-16: too few for their own genre).

## How a category is chosen

In order, the first one that answers wins (`enrichApps` in
`src/curator/enrich/index.ts`):

1. **Upstream store categories**: the freedesktop Main and Additional
   Categories of the highest-priority package that has some
   (`config/categories-apps.json`, `config/categories-games.json`; key
   order is preference order, specific before generic).
2. **The LLM verdict** (`config/llm-classifications.json`), only when
   step 3 finds nothing, or to change the type.
3. **In-house heuristics**: name rules (`category-rules.json`,
   `game-category-rules.json`), distro sections and AUR keywords
   (`category-section.ts`, `category-keywords.ts`), then description
   phrases (`description-category-rules.json`,
   `description-game-category-rules.json`).
4. **Refinements** (`config/category-refinements.json`) last: a broad
   category moves to a finer one when the app's name, short description
   or LLM verdict reason names it. This is how the many apps that carry
   only a generic signal (a bare `Network` key, Debian's `net` section, a
   verdict of the old taxonomy) still land in the right one: an IRC
   client filed under Networking moves to Messaging & Calls, an Arcade
   game about karts to Racing, a Game Boy emulator filed under System
   Tools to Gaming Tools. Each rule names the categories it may move an
   app out of, so a precise signal (Firefox's `WebBrowser` key) is never
   second-guessed by a phrase. A rule can also list freedesktop `keys`
   that move an app whatever its text: a `FileManager` key moves GNOME
   Files out of System Tools.

Anything still without an answer is "To Classify".

### New input for "To Classify"

Most apps left in "To Classify" carry a name and nothing else, and the
LLM answered them `low` (never applied). About half of them name a
GitHub repository (`CatalogApp.githubStars`), whose own description and
topics do say what the app is: `pnpm classify-llm --github-about` fetches
those (GraphQL, 100 repositories per query, into the gitignored
`.cache/github-about.ndjson`) and asks again with them in the prompt. The
repository's text is its owner's, licensed by GitHub's terms to other
users on GitHub, not for a public copy: it is never committed, only the
resulting verdicts, in the model's own few words. A verdict is kept only
at `medium` or `high` confidence, with a reason that names real content
(`isGenericReason`: "Desktop application" is a guess from nothing), and
only as `app` or `game`: in the first run a repository blurb called 4 of
21 real apps a library or "other", which would have hidden them. Apps
with a package from a restricted source are never sent, as in every
`classify-llm` run.

`pnpm classify-llm --homepage-about` does the same with the app's
homepage, for the To Classify apps that have one: the page's title and
meta description, or, for a GitHub repository, the opening of its README
(its description and topics are often empty). Fetched one page at a time
into the gitignored `.cache/homepage-about.ndjson`, never committed. A
page says nothing when its description is the site's own (Lutris's "Play
all your games on Linux" on every game page, GitLab's "GitLab.com") or it
names little beyond the app (`saysMoreThanName`): those apps aren't asked.
Only `high` verdicts are kept here. Checked by hand on the first run
(2026-11-18, gemini-3.8-flash, one request): 92 of the 93 `high` verdicts
were right, against about half of the 16 `medium` ones, which mostly
guessed from the name (a cycling trainer called "MaximumTrainer" filed
as a game trainer).

### Labels of an earlier taxonomy

`config/llm-classifications.json` is the models' raw output and is never
rewritten by hand, so it keeps the labels it was written with.
`LEGACY_APP_CATEGORY_LABELS` (`category.ts`) maps each retired label to
the catch-all of what it was split into ("Internet & Communication" →
Networking) or its new name (Settings → Desktop & Settings), and the refinements then read the verdict's own reason
("IRC client", "Torrent client") to move it further. `app` keeps old
links working the same way (its category aliases).

## Subcategories

Decided 2026-11-18: every category big enough gets a second level,
rather than more top-level categories. Flathub, KDE Discover, Steam,
Apple's games and Microsoft's developer tools all add a second level
where a category is big, and none has more than about 30 flat
categories. Splitting Developer Tools, System Tools and Utilities into
top-level categories would have made about 50, still left about 18,500
apps in "other developer/system tools" catch-alls, and broken the three
most visited category links. A second level breaks no link: the
subcategory is an extra filter, `/browse/?category=X&sub=Y`.

`config/subcategories.json` lists, per category, its subcategories and
the signals that file an app there (`enrich/subcategory.ts`). Within a
category the first rule that matches wins, in passes:

1. `names`: the display and package names (`gcc-14-mips-linux-gnu` is a
   cross-compiler, whatever else it says);
2. `keys`: freedesktop keys (`RevisionControl`, `TerminalEmulator`);
3. `sections`: distro sections, as `<source id>:<section>` globs
   (`ebuild-gentoo:dev-vcs`, `deb-*:vcs`);
4. `pattern`: the display name (an AUR suffix such as `-git` dropped:
   `corange-git` is a game engine, not a git tool), the short
   description and the LLM verdict's reason, as the refinements read
   them. For a game also its AUR keywords and the opening of its long
   description, where a game says its genre;
5. `weakKeys`/`weakSections`: signals too broad to beat the text
   (`Viewer`, `BoardGame`, Debian's `x11` and `admin`);
6. `fallbackNames`/`fallbackSections`: the language-module catch-all
   below.

Structured signals decide few apps: most of these buckets are AUR or Nix
packages with no section, and the LLM reason (on about 9 in 10 of them)
does most of the work, as for the refinements.

A category has subcategories only when they hold: at least two, of about
40 apps or more each, and at least half the category in one. Left flat:
Business, Social Media, Travel & Navigation, News & Weather and Web
Browsers (small, or one dominant kind), and Action, Arcade and Education,
where fewer than half the apps said which kind they are. The small game
genres stay flat too.

**What isn't a store app gets its own subcategory, not a filter.**
Cross-compilers and language modules (`gfortran-14-mips64el-linux-gnuabi64`,
`python3-…`, Gentoo's `dev-python`, Nix's `python3Packages`) go to
Developer Tools > Language Modules & Cross-Compilers (6,000 apps, about
40 with an icon), printer drivers to System Tools > Printers & Scanners,
Vim and Emacs plugins to Utilities > Editor Plugins. Search still finds
them; the other subcategories don't list them.

**Category fixes that came with it** (`category-refinements.json`, run
before the subcategories): window managers, bars, launchers, lock
screens and themes move from System Tools to Desktop & Settings (the
former Settings, renamed as it now holds them: about 1,300 apps); file
managers, archivers and duplicate finders from System Tools and
Developer Tools to Utilities; terminal emulators, multiplexers and
shells from Utilities and Developer Tools to System Tools; input
methods from System Tools to Utilities.

**Published** (`src/store/turso-client.ts`, pinned by
`store-contract.json`): a `subcategory` column on `apps` (nullable,
added in place by an incremental publish); `subcategoryCounts:<type>`,
the chips of a category page; `countSub:` counts under every `/browse`
filter but source (a source and a subcategory together are counted live,
one category's rows at most); and `subcategoryIds:` lists in
"popular first" order, so a subcategory page doesn't walk its whole
category (`apps` has no subcategory index: one would force a full
publish). `browseKeys.subcategories` tells `app` these exist.

## Kids

Not a category: an app for children is still an Education app or a
Puzzle game, and a category would take it out of those. The signals
measured 2026-11-16: the `KidsGame` key (42 games), "for children/for
kids/toddlers/preschool" in a description (74 apps and games in all,
some false positives such as "reaping children" processes), and the
OARS rating, which says what content an app is free of, not who it is
for (2,877 apps rated "0+"). A "For kids" collection (a tag shown as its
own row and filter) would sit on top of the categories rather than
replace one.

Decided 2026-11-17: no Kids category, and no collection for now. The age
rating is the dimension instead, a bracket per product and a "Suitable
for" filter on `/browse` ([`age-ratings.md`](age-ratings.md)). A For kids
category may come later, only for kid-oriented products neither the
categories (Education, Educational) nor the age filter find. Measured
2026-11-17 with the signals above plus "kids"/"children" keywords: 88
products, 63 of them found already (Education or Educational: 39; rated
7 or under: 24 more). Of the 25 left, a hand check finds 13 really made
for children: 5 learning tools filed as Developer Tools or Utilities
(Scratch, rated 16+ for its chat; BASIC-256, Little Wizard, Kitten,
StoryMaps), TupiTube (animation, Graphics & Design), Sukhi Play (a kiosk
browser for toddlers), and unrated games in their genre (lmemory, Pigs
and Cows, listed twice, pacman1, Hex-a-hop, Toontown Rewritten). The other 12 are
parental tools or false positives (Minitube, BombSquad, Roblox's
launcher). The learning tools are a category fix (Education), not a
reason for a new category.

## Measured 2026-11-16

Published dataset (`pnpm start`, private caches present), before → after
the split: Internet & Communication 8,794 → Networking 4,521, Messaging &
Calls 1,489, File Sharing & Downloads 1,275, Email 730, Web Browsers 548,
Social Media 166, Gaming Tools 45, News & Weather 21 (RSS readers).
Gaming Tools 1,290 in all (System Tools 933, Utilities 221, Developer
Tools 63, Internet & Communication 45, Settings 18, Photo & Video 10).
Games: Action 1,407 → 983 and Shooter 425; Adventure 830 → 474 and Visual
Novel 359; Sports 117 → 56 and Racing 92; Music & Rhythm 46. A hand check
of 80 random apps and games in the new categories found 71 right (89%,
67 of 72 outside Networking); the misses were mostly apps Networking keeps
as the catch-all (AI chat clients, an anime tracker), which the old
category had misfiled too.

## Measured 2026-11-18

Published dataset (`pnpm start`, private caches present), 106,687 apps.

- **Subcategories**: 69,873 apps have one. Biggest categories: Developer
  Tools 20,700 of 28,200 (Language Modules & Cross-Compilers 6,400,
  Languages & Runtimes 2,400, Debugging & Testing 2,200, Version Control
  1,500, Containers, Cloud & DevOps 1,500, Web & API 1,300, Build &
  Packaging 1,300, Databases 1,200, AI Coding Tools 1,100, IDEs & Code
  Editors 1,100), System Tools 14,900 of 22,500, Utilities 4,600 of
  10,100, Desktop & Settings 3,700 of 4,700. Games: Board & Cards 398 of
  445, Shooter 294 of 432, Puzzle 552 of 870.
- **Precision**: a hand check of 5 random apps in each subcategory (600
  in all) found 518 right; a second check of 10 apps in each of the nine
  weakest found 69 of 90 after a first round of fixes. Most misses are an app the
  category itself misfiles (a music tagger in Photo & Video lands in its
  nearest subcategory) or a broad phrase ("API", "server"). Weakest:
  Developer Tools > Web & API Development and Networking > Servers &
  Proxies (about 7 in 10); best: Finance, Board & Cards, Databases,
  Emulators, Terminals & Shells (all right).
- **To Classify**: 957 → 837 (apps 767, games 70). 110 Mobius Trader
  snaps (a white-label trading terminal, one per broker, no description)
  now are Finance by name (`* mobius`); 9 games whose short description
  is only their title are filed from their long description's first
  sentence; Epic Games Launcher by its description. Of the 837 left, 323
  have no description at all, 407 come from a source never sent to an
  LLM (Snap, Flathub, AppImageHub) with only a long description the
  rules don't recognize, and about 100 have a description the models
  found too vague. An app's long description is not used for its
  category: on the To Classify apps its first sentence named the right
  one only about two times in three.
- **To Classify with homepages** (`classify-llm --homepage-about`): 837 → 744. 199 homepages fetched, 141 said enough to ask, 93 `high` verdicts
  kept (1 wrong: parchives, whose homepage is its desktop environment's).
  What is left: 450 Snap, 29 AppImageHub and 4 Flathub apps, never sent
  to an LLM; about 195 others with no description and no homepage worth
  reading; 66 whose short description is too vague (re-asked with
  gemini-3.8-flash in a sample, they came back mostly as `medium`
  guesses from the name, so they weren't).
- **Publish cost**: one incremental publish from `main`'s dataset
  (`pnpm seed --measure`): 112,891 rows written (70,900 apps updated,
  8,657 meta rows), 196,658 read, no full publish.

## Measured 2026-11-17

Published dataset (`pnpm start`, private caches present), 106,709 apps.

- **AI**, refinements alone: 0 → 450, from Developer Tools 195,
  Networking 83, Productivity 63, Utilities 33, System Tools 29,
  Messaging & Calls 19, Graphics & Design 15, Education 3, Settings 3,
  Photo & Video 2, Science 2, Security 2 and Web Browsers 1. A hand
  check of 60 random apps found 59 right (98%); the miss, an AI agent
  framework, belongs in Developer Tools (the third refinement now sends
  such a framework back when an LLM verdict files it under AI). Roughly
  600 AI coding tools (coding agents, AI code review, AI commit message
  writers) stay in Developer Tools on purpose.
- **Gaming Tools**: the refinement now reads consoles separated by
  slashes ("GameCube / Wii / Triforce Emulator", Dolphin), DOSBox and
  its front ends, Doom and Quake source ports, Steam and the Epic, GOG
  and Amazon launchers (Heroic): 34 apps move, 27 of them from System
  Tools. A Minecraft launcher Flathub tags with game genres and
  PackageManager (Prism Launcher, MultiMC) is now an app, not an Action
  game. 34 of the 36 moves are right; the misses are a cross-compiler
  for DOSBox and an Unreal asset manager for the Epic store.
- **Gaming Tools**, engines: a second rule for the engines that play a
  named classic game (Quakespasm, DarkPlaces, Quake3e, Xash3D,
  D2X-Rebirth, OpenJK, Commander Genius, the Sonic decompilations), their
  launchers and server browsers (Doom Runner, Doomseeker) and interactive
  fiction interpreters (Frotz, Glulxe): 55 apps, from System Tools 36,
  Developer Tools 11 and Utilities 8, all right on a hand check. Engines
  for making games (Godot, Unity, Unreal Engine 4) and anything that
  edits, builds or extracts for one (TrenchBroom, Ultimate Doom Builder)
  stay developer tools.
- **Tools that game keys kept as games**: an emulator or interpreter its
  store tags Emulator (MAME, Supermodel, ScummVM, TIC-80, PokeMMO), an
  editor, server or modpack installer "for the X game" (Freeciv's, Exult
  Studio), whatever genre keys they also carry; and a product whose only
  game evidence is a Debian `game::toys`/`game::typing` debtag while its
  AppStream keys name no game (XaoS, KTouch, Klavaro). 16 products leave
  the games, to Gaming Tools when their own keys only say System Tools,
  Utilities or nothing. Found by the homepage's all-ages games row, which
  MAME, ScummVM, XaoS and "Freeciv ruleset editor" topped: the Freeciv
  game's card carried that name because openSUSE's `freeciv` AppStream
  lists only the editor and the server (match config now groups it with
  the editor).
- **Education** from the tools made for children found under Kids above
  (Scratch, BASIC-256, Little Wizard, Kitten, StoryMaps, TupiTube), plus
  Scratux, xLogo, UCBLogo, Tupi, Greenfoot and KuMir: 12 apps, from
  Developer Tools 8, Graphics & Design 2, System Tools 1 and Utilities 1,
  all right on a hand check.
- **System Tools** from Utilities: system and hardware monitors,
  firmware and driver tools, container and VM tools, terminal
  emulators: 269 apps. 58 of 60 sampled are right (an X-Face viewer
  and a terminal colorscheme converter are not).
- **To Classify**: 1,353 (apps 1,270, games 83) → 957 (878, 79).
  `classify-llm --github-about`: 487 repositories fetched (5 GraphQL
  queries), 441 with a description or topics, 3 Gemini requests
  (gemini-3.1-flash-lite, free tier), 401 verdicts kept (40 left out:
  low confidence or a reason naming no content, and 21 library/other).
  A hand check of 60 random kept verdicts found 49 right (82%), against
  91% for the same model on store descriptions (`config/llm-models.json`):
  a repository blurb is thinner than a store listing. Then AI 492.
