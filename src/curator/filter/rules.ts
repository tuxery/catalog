import type { PackageSourceId } from "../../sources";

// Cross-distro Linux packaging naming conventions that reliably indicate a
// support package (dev headers, debug symbols, docs, fonts, libraries,
// language-ecosystem modules) rather than something a user would search an
// app store for. Deliberately conservative:
// - `^lib` is a blanket noise prefix (see below) rather than a narrower
//   soname-versioned-only check — real exceptions (LibreOffice, LibreCAD,
//   ...) are rescued via `config/filter-keep.json` instead of trying to keep
//   excluding them by pattern, since prefix matching can't reliably tell
//   libreoffice/librecad apart from the many other `libre*` names that are
//   coincidentally "lib" + a word starting with "re" (libreadline,
//   librealsense, librecast, ...) — only an exact-name allowlist can.
// - A `^rust-`/`^golang-` prefix would have wrongly excluded
//   rust-analyzer, a real standalone tool Debian happens to name that way
//   — real Rust/Go CLI tools (ripgrep, bat, fd-find, hugo) get their own
//   clean name in these distros, only the language's own library/build
//   ecosystem uses the prefix, and there's no clean way to tell those
//   apart by name alone. Left in rather than risk hiding real tools. Older
//   "library-culture" ecosystems below (Perl, OCaml, Haskell, Lua, R, Tcl)
//   don't have this problem — their prefixed packages are overwhelmingly
//   modules/libraries, not user-facing tools, unlike Rust/Go's real
//   CLI-tool culture.
// - Checked and rejected this round, same Rust/Go trap: `python\d*-`/`py3-`
//   (python3-pip, python-shandy-sqlfmt, and other real CLI tools ride the
//   same prefix as the library ecosystem), `ruby\d*-`/`rubygem-`
//   (ruby-foreman, ruby-guard, ruby-nanoc-cli, ...), `node-`/`nodejs-`
//   (nodejs-electron, nodejs-ember-cli, nodejs-forever, ...), `php\d*-`
//   (php\d\d-cli/-fpm/-composer are the interpreter/daemon/package-manager
//   themselves, not noise), and Debian's own `haskell-` prefix
//   (haskell-threadscope, haskell-hakyll, haskell-cabal-install-solver,
//   ...) — a different, unsafe convention from Fedora's `ghc-` prefix
//   below, which stays safe for the same ecosystem. `xorg-` was checked
//   too and only partially rejected — real diagnostic tools (xorg-xev,
//   xorg-xwininfo, xorg-transset) share the bare prefix with real noise,
//   so only the unambiguous `xorg-x11-drv-`/`xorg-fonts-`/`xorg-util-macros`
//   sub-conventions are excluded below, not `xorg-` itself.
const NOISE_PATTERNS: RegExp[] = [
  // Development headers, debug symbols, documentation (Debian/Ubuntu-style
  // suffixes) and their Fedora-style equivalents (-devel, -debuginfo,
  // -debugsource use a full word rather than an abbreviation).
  /-(dev|dbg|dbgsym|docs?|devel|debuginfo|debugsource)$/,
  // Any `lib`-prefixed package — see this file's header comment on why a
  // narrower pattern (only soname-versioned names like libssl3) doesn't
  // scale; real exceptions are allowlisted by exact name in
  // config/filter-keep.json instead.
  /^lib/,
  // Fedora's `-libs` suffix convention (e.g. zlib-libs) — doesn't start
  // with "lib" itself, so needs its own pattern even with the blanket
  // `^lib` prefix above.
  /-libs$/,
  // Static-library variant packages.
  /-static$/,
  // Fonts. `ttc-` (TrueType Collection) added live investigating the
  // apps "To Classify" bucket (2026-09-02): 50 real matches (mostly
  // Iosevka's own coding-typeface variant family), zero non-font
  // exceptions.
  /^(ttf|fonts|otf|ttc)-/,
  // Perl/OCaml/Haskell/Lua/R/Tcl module packages — Fedora-style prefix
  // naming (perl-DBI, ocaml-astring, ghc-Cabal, lua-cqueues, R-DBI,
  // tcl-snack), including Fedora's own per-GHC-version variant
  // (ghc9.10-base, ghc9.2-Cabal-prof, ...) — verified live: 704 real
  // matches, same library-package shape as bare `ghc-`, no CLI-tool trap.
  // The Debian-style equivalent (libwww-perl, libxml-simple-perl, ...) is
  // already caught by the blanket `^lib` prefix above, since that
  // convention always starts with "lib".
  /^(perl|ocaml|ghc[\d.]*|lua[\d.]*|R|tcl)-/,
  // Desktop-shell extensions/widgets (GNOME Shell, KWin, Plasma, COSMIC) —
  // need their shell/compositor as a host to do anything, same "not
  // launchable on its own" reasoning as a library. Decided 2026-08-20:
  // exclude for now rather than build a dedicated "Extensions" section:
  // - `gnome-shell-extension-` — real and large (verified live: 422 AUR,
  //   1,378 Nixpkgs, 48 Fedora, 41 Debian, among others). Two real
  //   standalone tools happen to share the prefix despite not being
  //   extensions themselves — `gnome-shell-extension-manager` (a GTK app)
  //   and `-installer` (a bash script) — rescued via `config/filter-keep.json`.
  // - `kwin-effect(s)-`/`kwin-style-`/`kwin-decoration-` — KWin visual
  //   effects/window themes (kwin-effects-burn-my-windows,
  //   kwin-style-breeze, kwin-decoration-oxygen, ...). Deliberately doesn't
  //   match bare `kwin`/`kwin-x11`/`kwin-wayland`/`kwin-common`/etc. — the
  //   compositor itself, a different (if also not very "launchable")
  //   category not in scope here.
  // - `plasma[0-9]*-applets?-` / `-plasma-applet` / `-plasmoid[-git]` —
  //   Plasma widgets, whose naming shows up as both a prefix
  //   (plasma6-applets-kara) and a suffix (kalgebra-plasmoid,
  //   kclock-plasma-applet) depending on packager.
  // - `cosmic-ext-applet-` only, not the broader `cosmic-ext-` prefix —
  //   verified live that `cosmic-ext-` also covers real standalone
  //   third-party COSMIC-ecosystem apps (cosmic-ext-calculator,
  //   cosmic-ext-tweaks, cosmic-ext-control-center, ...), not just panel
  //   applets — a blanket `cosmic-ext-` prefix would have wrongly excluded
  //   those.
  /^gnome-shell-extension-/,
  /^kwin-(effects?|style|decoration)-/,
  /^plasma\d*-applets?-|-plasma-applet$|-plasmoid(-git)?$/,
  /^cosmic-ext-applet-/,
  // DKMS kernel modules/drivers (nvidia-580xx-dkms, acpi-call-dkms,
  // bbswitch-dkms, nvidia-dkms-535-open, nvidia-340xx-dkms-macbook, ...)
  // — need `insmod`/the kernel itself as a host, never launched on their
  // own, same reasoning as a library. Verified live: 484+ in AUR alone
  // plus Ubuntu's own nvidia-dkms-<version>[-open|-server] driver
  // packages, no exceptions found — every sample was a driver, whether
  // "dkms" lands as a clean suffix or has a version/variant tag after it.
  /-dkms(-|$)/,
  // `-module` suffix — verified live across 8 sources (~50+ samples, zero
  // counter-examples): GTK input-method modules (appmenu-gtk3-module,
  // unity-gtk-module), kernel modules (vhba-module, webcamstudio-module,
  // "Kernel module for webcam studio's virtual webcam device"), Node.js
  // CommonJS modules (node-is-module, node-which-module), Perl test
  // modules, and app-specific plugin modules (gtklock-*-module,
  // polybar-*-module, nginx-upload-module) — never a launchable app on its
  // own, same "needs a host" shape as this file's other plugin/extension
  // patterns.
  /-module$/,
  // "SDK"-named packages — verified live: overwhelmingly per-service API
  // client libraries (aws-sdk-cpp-<service>: 400+ packages across
  // sources, one per AWS service; aliyun-python-sdk: 490 in Nixpkgs
  // alone; azure-sdk, py3-sentry-sdk/slack-sdk/splunk-sdk, ...) or build
  // kits (plasma-sdk, libreoffice-sdk, the KDE/Qt Snapcraft "content
  // snap" SDKs) — never launched, same shape as the library patterns
  // above. Real exceptions exist and are rescued via
  // config/filter-keep.json: dotnet-sdk (a real CLI toolchain — `dotnet
  // build`/`dotnet run` — across its several per-distro naming schemes),
  // wasi-sdk (a clang-based toolchain), google-cloud-sdk (the `gcloud`
  // CLI), and bare android-sdk (`sdkmanager`) — but NOT its per-component
  // sub-packages (android-sdk-build-tools-*, -platform-tools, -cmake-*),
  // which are libraries, not the tool itself.
  /(^|-)sdk(-|$)/,
  // Language/translation-pack suffixes — verified live across many
  // sources and host apps (Firefox, Thunderbird, LibreOffice, KDE, Qt6,
  // avogadro2, glibc, tesseract, pgadmin4, shotcut, cockatrice,
  // guayadeque, ...): a per-language data bundle for an app already
  // captured under its own base name, never launchable on its own. Real
  // scale found live, previously undiscovered: 271 `-l10n-` matches on
  // Debian alone, 869 `-langpack-` matches on Fedora just for avogadro2,
  // 190 `-locale-` matches on Ubuntu — searching "firefox" or "vlc"
  // surfaced hundreds of these burying the one real, well-merged app card
  // (Firefox/VLC themselves *are* correctly merged across ~14-20 sources
  // each — the "missing everywhere" impression was this noise, not an
  // actual matching gap). Requires a real language-code shape after the
  // marker (2-3 letters, optionally `_REGION`/`-variant`) so it can't
  // accidentally swallow an unrelated `-locale-dev`-style name — though
  // even those are already caught by the `-dev` suffix pattern above
  // regardless. Arch/AUR/Void's own marker word for the identical concept
  // — `-i18n-` — found live investigating a real "firefox-bin isn't
  // classified" bug report: turned out to be a real firefox-bin merge gap
  // (fixed separately, see match/group.ts), but the same search also
  // surfaced 608 firefox-esr-i18n-<lang>/firefox-developer-edition-i18n-
  // <lang> language packs standing as their own "To Classify" entries —
  // same shape as the -l10n-/-langpack-/-locale- markers above, verified
  // live: every single match across pacman-aur/pacman-arch/xbps-void is a
  // language pack, no counter-examples. openSUSE's YaST2's own marker —
  // `-trans-` — found the same way, sweeping the broader "To Classify"
  // set for more of this shape: 78 real yast2-trans-<lang> matches, no
  // counter-examples (one incidental non-YaST2 match, rime-project-trans-
  // bin, is itself a dictionary data file too).
  /-(l10n|langpack|locale|i18n|trans)-[a-z]{2,3}(?:[_-][a-zA-Z]+)?$/,
  // Alpine's own convention for the same thing, no per-language split —
  // verified live: 1,831 matches across every source that uses it, always
  // <real-app-name>-lang (aisleriot-lang, akregator-lang, ark-lang,
  // inkscape-lang, ...), no counter-examples found.
  /-lang$/,
  // Alpine's own convention for a precompiled-bytecode derivative of an
  // existing Python package (py3-<pkg>-pyc, "Precompiled Python bytecode
  // for py3-<pkg>") — a build artifact of a package already captured
  // under its own name, never itself launchable, by construction (there's
  // no such thing as a real standalone app whose whole purpose is "the
  // .pyc files for X"). Verified live: 1,864 matches, always this exact
  // shape, no counter-examples possible.
  /-pyc$/,
  // NVIDIA's own per-driver-branch "utilities" package (bare `nvidia-utils`
  // on official Arch repos, `nvidia-<version>xx-utils` on AUR for older/
  // alternate branches — 340xx through 580xx, plus `nvidia-vulkan-utils`)
  // — verified live: 14 real matches, every one literally described
  // "NVIDIA drivers utilities" with no other content, bundling shared
  // OpenGL/Vulkan libraries (needed by the graphics stack, not launched)
  // plus `nvidia-smi`, a CLI diagnostic tool riding along. Same
  // "many near-identical branch-versioned variants" shape as this file's
  // `-dkms` pattern already excludes for the same driver family.
  // Deliberately narrow — a blanket `-utils` pattern was checked and
  // rejected elsewhere in this file (bridge-utils, cifs-utils, alsa-utils
  // are real standalone tools), this is scoped to the exact nvidia naming
  // convention only.
  /^nvidia(-(?:\d+xx|vulkan))?-utils$/,
  // Brave's own Rust adblock-parsing engine, published on PyPI as
  // "adblock" and re-packaged under each distro's own Python-binding
  // naming convention (python-adblock, python3-adblock, py3-adblock,
  // python313-adblock, python314-adblock, ...) — a real library, not the
  // browser and not an extension, leaking identically on 5 separate
  // sources before this pattern existed (previously excluded one exact
  // name per source, which needed a new entry every time Python cut a
  // new version — python315-adblock, python316-adblock, ... would each
  // have needed its own line forever). Verified live across every
  // source's cache: every single match of this exact compound name
  // describes the same library, homepage always
  // github.com/ArniDagur/python-adblock or pypi.org/project/adblock,
  // zero counter-examples. Scoped to the *compound* name only — a bare
  // `python\d*-` or `py3-` prefix is deliberately NOT a general pattern
  // (checked and rejected elsewhere: too many real CLI tools use it).
  /^(python\d*|py3)-adblock$/,
  // profile-sync-daemon's own convention for shipping each supported
  // browser/app's tmpfs-sync config as its own separate AUR package —
  // verified live: 8 real matches (edge, edge-stable, floorp, librewolf,
  // thunderbird, waterfox, zen — the real bug report that prompted
  // checking this one — zotero), every one literally "<app> support for
  // profile-sync-daemon", never launchable on its own (replaces what
  // would otherwise have been an 8-line one-exact-name-per-app override).
  // Scoped to the enumerated known suffixes, not a bare
  // `profile-sync-daemon-` prefix — the base tool's own real build
  // variants (`profile-sync-daemon-git`, `-openrc-git`) share that prefix
  // and must stay untouched; profile-sync-daemon itself is a real,
  // standalone CLI tool (syncs browser profile dirs to RAM).
  /^profile-sync-daemon-(edge(-stable)?|floorp|librewolf|thunderbird|waterfox|zen|zotero)$/,
  // GNU R's CRAN/Bioconductor/other package-repository naming convention
  // (r-cran-*, r-bioc-*, r-other-*) — the non-Debian equivalent of this
  // file's own "gnu-r" Section rule below (NOISE_SECTIONS), for sources
  // without a comparable Section field (Fedora, openSUSE, AUR, ...) that
  // still use this exact name prefix for the same CRAN/Bioconductor
  // mirror. Verified live: 106 real matches, all library packages, zero
  // counter-examples (r-cran-getopt's "command-line parsing
  // functionality" is a library *for* an R script's own CLI parsing, not
  // itself launchable).
  /^r-(cran|bioc|other)-/,
  // MinGW's Windows cross-compilation target packages (mingw32-*,
  // mingw64-*, and Fedora's own hyphenated mingw-w64-* spelling for the
  // identical convention) — unlike every other pattern in this file,
  // these aren't excluded because they're *likely* a library, they're
  // excluded because the binary they produce targets Windows and by
  // construction cannot run on the Linux host at all, whatever it is
  // (even mingw32-gcc, mingw64-gvnc-tools, mingw-w64-pybind11 — all
  // "tool"/"library"-sounding by name — are still cross-compiled *for
  // Windows*, not something a Linux user would search a Linux app catalog
  // for). Verified live: 889 real mingw32-/mingw64- matches plus 707 real
  // mingw-w64- matches, every one Windows-target by its own description.
  /^mingw(32|64|-w64)-/,
  // Qt5/Qt6 framework's own internal component packages (qt5-multimedia,
  // qt6-qtbase-mysql, ...) — real Qt-based apps never carry this prefix
  // themselves (kate, dolphin, calibre, ...), same "library ecosystem, not
  // an app" shape as this file's perl-/ocaml-/ghc- pattern above, and the
  // same conclusion Nixpkgs' own `qt6Packages` prefix already reached
  // below. Verified live: 781 real matches, all Qt library/tool/doc/
  // example sub-packages; the handful of real standalone developer tools
  // mixed in (qt5-qmake, qt5-qdbusviewer, qt6-qdbusviewer,
  // qt6-tools-qdbus) are rescued via config/filter-keep.json rather than
  // loosening this rule.
  /^qt[56]-/,
  // KDE Frameworks 6's own component packages (kf6-kio, kf6-kwallet, ...)
  // — same shape as qt5-/qt6- above, real KDE apps (kate, dolphin, okular)
  // never carry this prefix. Verified live: 360 real matches, all
  // framework/tool/doc sub-packages, no real standalone exception found.
  /^kf6-/,
  // Emacs Lisp Package Archive packages (elpa-treemacs, elpa-org-bullets,
  // ...) — need Emacs itself as a host to do anything, same "not
  // launchable on its own" reasoning as this file's gnome-shell-extension-/
  // kwin- patterns above. Verified live: 416 real matches; every sampled
  // "suspect" (elpa-ledger, elpa-sxiv, ...) turned out to be an Emacs-mode
  // wrapper *around* an already-separately-packaged real tool, not the
  // tool itself.
  /^elpa-/,
  // Hunspell/MySpell spell-check dictionary packages (hunspell-es,
  // myspell-en_JM, ...) — per-language word lists, never launchable.
  // Verified live: 455 real matches, zero counter-examples.
  /^(hunspell|myspell)-/,
  // Fedora's own leading-prefix convention for the same locale/font-pack
  // concept this file's `-(l10n|langpack|locale)-` and `-lang` suffix
  // patterns above already catch as a suffix (langpacks-core-am,
  // langpacks-fonts-mai, ...). Verified live: 301 real matches, zero
  // counter-examples.
  /^langpacks?-/,
  // SELinux policy module packages (selinux-ipmitool, selinux-wireguard,
  // ...) — need SELinux itself as a host, same reasoning as this file's
  // -dkms pattern above. Verified live: 326 real matches; the one real
  // exception (selinux-tools, a genuine sysadmin CLI toolkit despite the
  // prefix) is rescued via config/filter-keep.json.
  /^selinux-/,
  // TeX Live's own macro/style/class package convention (texlive-euler,
  // texlive-supertabular, ...) — same "library ecosystem" shape as this
  // file's R/Perl/OCaml/Haskell/Lua/Tcl patterns above, just not yet
  // covered by name. Verified live: 5,514 real matches, overwhelmingly
  // LaTeX packages/styles/classes with no standalone entry point; a
  // handful of real standalone conversion/viewer tools TeX Live also
  // ships under the same prefix (texlive-dvipng, -epspdf, -a2ping,
  // -pdfpc) are rescued via config/filter-keep.json rather than loosening
  // this rule.
  /^texlive-/,
  // Xorg's own driver/font/build-macro sub-conventions — unlike the bare
  // `xorg-` prefix (checked and rejected, see this file's header comment),
  // these three are unambiguous: `xorg-x11-drv-*` are kernel/X11 input or
  // video drivers (verified live: 29 real matches, all drivers),
  // `xorg-fonts-*` are bitmap font packages (17 real matches, all fonts),
  // and `xorg-util-macros` is a single Autotools build-macro package.
  /^xorg-x11-drv-/,
  /^xorg-fonts-/,
  /^xorg-util-macros$/,
  // Nginx's own module-package convention (nginx-mod-vts, nginx-mainline-
  // mod-rtmp, ...) — needs nginx itself as a host, same "not launchable on
  // its own" reasoning as this file's -module pattern above, just under
  // nginx's own naming rather than a bare `-module` suffix. Verified live:
  // 153 real matches, all modules; deliberately doesn't match the bare
  // `nginx`/`nginx-mainline` packages themselves, nor real standalone
  // tools that merely mention nginx (nginx-config-formatter,
  // nginx-language-server, ...), which don't share this exact shape.
  /^nginx(-mainline)?-mod(ule)?-/,
  // Tesseract OCR's own per-language/per-script trained-data convention
  // (tesseract-data-best-heb, tesseract-script-hangul, tesseract-osd,
  // tesseract-langpack-chi_sim_vert, ...) — data files, never launchable,
  // same shape as this file's dictionary/langpack patterns. Verified
  // live: 725 real matches; deliberately doesn't match the handful of
  // real standalone tools riding the same bare prefix (tesseract-ocr
  // itself, tesseract-gui, tesseract-server, tesseract-game — an
  // unrelated FPS, tesseract-matrix — an unrelated Matrix chat client).
  /^tesseract-(data|ocr|script|langpack)-|^tesseract-(equ|osd|common|tools|data)$/,
  // fortune-mod's own per-quote-collection package convention (fortune-
  // mod-lambda, fortune-mod-kaamelott, ...) — a data file for the fortune
  // command, never launchable on its own. Verified live: 98 real matches,
  // all quote collections.
  /^fortune-mod-/,
  // StarDict's own per-language dictionary-data convention (stardict-cz,
  // stardict-freedict-eng-fra, ...) — data files, never launchable;
  // doesn't match bare `stardict` (the real dictionary application
  // itself) since that name has no trailing `-`. Verified live: 109 real
  // matches, all dictionary data.
  /^stardict-/,
  // Certbot's own per-DNS-provider plugin convention (certbot-dns-gandi,
  // certbot-dns-porkbun, ...) — needs certbot itself as a host, same
  // "not launchable on its own" reasoning as this file's -module pattern.
  // Verified live: 39 real matches, all DNS-01 plugins; deliberately
  // doesn't match bare `certbot`/`certbot-dns` (the real ACME client
  // and its DNS-integrations umbrella package) or its other real plugins
  // (certbot-nginx-git, certbot-apache-git, ...), which don't share this
  // exact shape.
  /^certbot-dns-[a-z]/,
  // MATLAB's own per-release GCC-version-pin meta-package convention on
  // AUR (matlab-r2024a-gcc-fortran-meta, matlab-r2023b-gcc8-meta, ...) —
  // pins which GCC version to build MEX files against for one MATLAB
  // release, never itself launchable. Verified live: 68 real matches, all
  // build-toolchain pins; doesn't match bare `matlab` or real toolboxes
  // riding the same prefix (matlab-dipimage, ...).
  /^matlab-r\d{4}[ab]?-gcc/,
  // Shell tab-completion script packages (docker-stable-fish-completion,
  // kubens-bash-completion, mcphost-bash-completion, ...) — need the real
  // tool already installed as a host, same "not launchable on its own"
  // reasoning as this file's -module pattern; found live sweeping
  // openSUSE's own "System/Shells" Section for a category signal, but the
  // convention turned out to be cross-source, not openSUSE-specific.
  // Verified live: 1,501 real matches across every source, overwhelmingly
  // apk-alpine/rpm-opensuse; doesn't match the real shells themselves
  // (bash-git, fish-git, zsh-git, tcsh-git, mksh, scsh-git, ...), which
  // don't share this exact suffix shape.
  /-(bash|fish|zsh)-completion$/,
  // Aspell/Ispell's own per-language dictionary-data convention
  // (aspell-ky, ispell-brazilian, ...) — same shape as this file's
  // existing hunspell-/myspell- pattern, just a different spell-checker
  // engine; found the same way as the completion-script pattern above.
  // Verified live: 230 real matches across every source; doesn't match
  // bare `ispell` (the real spell-checker program itself), nor `aspell`'s
  // own real AUR VCS-build variant `aspell-git` — a real regression this
  // pattern caused on its first pass, caught by the same before/after
  // pipeline diff this whole session's changes are verified with.
  /^(aspell|ispell)-(?!(?:git|svn|hg|bzr|cvs|bin)$)/,
  // dict/dictd's own per-dictionary data convention (dict-freedict-tur-
  // deu, dict-gcide, dict-moby-thesaurus, ...) — data files for the dictd
  // server/client, never launchable, same shape as this file's stardict-/
  // hunspell-/aspell- patterns. Verified live: 272 real matches, doesn't
  // match bare `dict` (the real dictd client program).
  /^dict-/,
  // Font/hyphenation-data conventions not already caught by this file's
  // `^(ttf|fonts|otf)-` prefix pattern — woff2-/xfonts- (font files) and
  // hyphen- (hyphenation-pattern data). Verified live: 218 real matches
  // across all three, zero counter-examples.
  /^(woff2|xfonts|hyphen)-/,
  // TeX Live's own distribution-bundle packaging convention
  // (texmf-dist-langspanish, texmf-dist-latex, ...) — the same LaTeX
  // macro-package content this file's `^texlive-` pattern already
  // excludes, just packaged as per-collection texmf-dist-* bundles
  // instead. Verified live: 82 real matches, all TeX Live collections.
  /^texmf-dist-/,
  // GObject introspection binding-metadata packages (typelib-1_0-ICal-
  // 3_0, typelib-srpm-macros, ...) — the same concept as this file's
  // NOISE_SECTIONS "introspection" Debian Section value below, just
  // openSUSE's own name-prefix convention for sources with no comparable
  // Section signal. Verified live: 70 real matches, all binding metadata.
  /^typelib-/,
  // LibreOffice's own per-language thesaurus-data convention (mythes-gl,
  // mythes-lb, ...) — same shape as this file's dict-/hunspell-/aspell-
  // patterns. Verified live: 45 real matches, all thesaurus data.
  /^mythes-/,
  // Font packages using "woff-" (uncompressed-adjacent WOFF font family
  // bundles) not already caught by this file's `^woff2-` pattern —
  // verified live: 45 real matches, all font families.
  /^woff-/,
  // Adobe's own font/character-mapping-data packages (adobe-source-han-
  // mono-hk-fonts, adobe-mappings-cmap, adobe-dng-lcp, ...) — scoped
  // narrowly by suffix/prefix, not a blanket `^adobe-` (checked and
  // rejected: adobe-reader-11 and Adobe-Connect-Linux are real standalone
  // apps sharing the prefix, adobe-afdko/adobe-bin2c-git are real dev
  // tools). Verified live: 39 real matches across these four shapes, zero
  // counter-examples.
  /^adobe-.*-fonts$/,
  /^adobe-.*-otc$/,
  /^adobe-mappings-/,
  /^adobe-dng-/,
  // A generic "font-" prefix (font-inter, font-iosevka, font-jetbrains-
  // mono, ...) — real typefaces, same "not a launchable app" reasoning as
  // this file's other font patterns, just not caught by the leading
  // ttf-/fonts-/otf- shape. Verified live: 371 real matches; the small
  // handful of real standalone tools riding the same prefix (font-editor,
  // font-line, font-validator, font-v) are rescued via
  // config/filter-keep.json rather than loosening this rule.
  /^font-/,
  // Ubuntu's own per-desktop/per-language translation-pack convention
  // (language-pack-gnome-de, language-pack-th-base, language-pack-kde-sv,
  // ...) — the same langpack concept this file's `-(l10n|langpack|
  // locale|i18n|trans)-` suffix pattern already catches, just as a
  // leading prefix with an extra desktop-environment component in the
  // middle that pattern can't match. Verified live: 392 real matches, all
  // language packs.
  /^language-pack-/,
  // LibreOffice's own per-language autocorrection-rules data convention
  // (autocorr-af, autocorr-de, ...) — same shape as this file's dict-/
  // mythes-/hunspell- patterns. Verified live: 38 real matches, all
  // autocorrection rule sets.
  /^autocorr-/,
  // Google's own Noto font-family packages (google-noto-sans-lao-vf-
  // fonts, google-noto-color-emoji-fonts, ...) — real typefaces, same
  // reasoning as this file's other font patterns. Verified live: 331 real
  // matches, all Noto font families.
  /^google-noto-/,
  // AUR/Nixpkgs/Void's own bare "noto-fonts-"/"noto-font-" convention
  // (noto-fonts-cjk-vf, noto-fonts-ar, ...) and the separate "nerd-fonts-"
  // family (nerd-fonts-jetbrains-mono, nerd-fonts-noto-sans-mono, patched
  // programming-font variants of Noto/other typefaces) — not caught by
  // this file's `^font-`/`^google-noto-` patterns, which both require a
  // different prefix shape. Surfaced live investigating the apps "To
  // Classify" bucket (2026-09-02): 152 real matches across apk-alpine/
  // nix-nixpkgs/pacman-arch/pacman-aur/slackware/xbps-void, all real
  // typefaces (verified against nix-nixpkgs's own descriptions, all
  // literally starting "Nerd Fonts: ..." or naming a Noto script/weight).
  /^noto-fonts?-/,
  /^nerd-fonts-/,
  // GNOME's own Adwaita typeface family (adwaita-fonts, adwaita-fonts-mono/
  // -sans/-all/-ttf, Fedora's inverted adwaita-mono-fonts/adwaita-sans-fonts)
  // — real fonts, not the separate Adwaita GTK/icon/cursor THEME family
  // (adwaita-icon-theme, adwaita-qt5/6, ...), which stays a real
  // categorizable app family instead (see config/category-rules.json's
  // "adwaita*" entry). Surfaced live investigating the apps "To Classify"
  // bucket (2026-09-02): 11 real matches across apk-alpine/ebuild-gentoo/
  // eopkg-solus/nix-nixpkgs/pacman-arch/rpm-fedora/rpm-opensuse/slackware/
  // xbps-void, all real typefaces.
  /^adwaita-(fonts|mono-fonts|sans-fonts)/,
  // SIL International's own typeface family (sil-abyssinica, sil-doulos,
  // sil-charis, sil-gentium-*, its -fonts-all/-fonts-doc/-fonts-common
  // sub-packages, ...) — real fonts, no consistent "fonts" substring to
  // anchor on (several ship as bare sil-<name> with the word "font" only
  // in their description), so this is a blanket `sil-` prefix like `^lib`
  // above, with the one real exception (`sil-q`, an unrelated real
  // roguelike game) rescued via config/filter-keep.json rather than
  // narrowing the pattern. Surfaced live investigating the apps "To
  // Classify" bucket (2026-09-02): 50 real matches across apk-alpine/
  // nix-nixpkgs/rpm-fedora/xbps-void, all real SIL typefaces.
  /^sil-/,
  // Jane Street's OCaml PPX (preprocessor extension) ecosystem
  // (ppx_deriving, ppx_compare, ppx_assert, ...) — build-time syntax-
  // extension libraries, not launchable apps, same reasoning as this
  // file's other language-ecosystem patterns; uses an underscore instead
  // of the hyphen this file's `^(perl|ocaml|ghc[\d.]*|lua[\d.]*|R|tcl)-`
  // pattern requires, so it needs its own entry. Surfaced live
  // investigating the apps "To Classify" bucket (2026-09-02): 45+ real
  // matches, all real OCaml PPX rewriter libraries (Gentoo's own dev-ml
  // category for every one sampled).
  /^ppx_/,
  // Intel's own two typeface packages (intel-clear-sans-fonts,
  // intel-one-mono-fonts) — carved out ahead of config/category-rules.json's
  // broader "intel-*" entry (drivers/firmware/developer tooling), same
  // "exclude the font before the family rule sees it" shape as
  // adwaita-fonts vs. adwaita*.
  /^intel-.*-fonts$/,
  // Pop!_OS's own "Pop Fonts" package — carved out ahead of
  // config/category-rules.json's broader "pop-*" entry, same shape as
  // intel-*-fonts/adwaita-fonts above.
  /^pop-fonts$/,
  // Google's own bare typeface family (google-fonts, google-fonts-ttf,
  // google-roboto-*-fonts, google-droid-*-fonts, google-arimo-fonts,
  // google-crosextra-caladea-fonts, ...) — distinct from the already-
  // excluded `^google-noto-` family (a Google typeface too, just its own
  // separate naming convention). Real fonts, not launchable apps, same
  // reasoning as every other font pattern in this file. Surfaced live
  // investigating the apps "To Classify" bucket (2026-09-02): 23 real
  // matches, all real Google-published typefaces.
  /^google-.*fonts/,
  // CERN ROOT's own bundled font collection (root-font-files) — carved
  // out ahead of config/category-rules.json's broader "root-*" entry,
  // same shape as intel-*-fonts/adwaita-fonts above.
  /^root-font-files$/,
  // The CPAN "XML-*" Perl-module naming convention, exactly as Gentoo
  // mirrors each distribution's own capitalized name verbatim rather than
  // lowercasing it behind a "perl-" prefix like other distros do (dev-perl/
  // XML-Atom, not perl-xml-atom) — this file's existing `^perl-` pattern
  // never reaches this shape. Also covers the lowercase "xml-*" library
  // packages other sources use for the same or adjacent XML-tooling
  // libraries (xml-commons-*, xml-conduit, xml-maven-plugin, ...). Real
  // standalone CLI tools riding the same prefix (xml-coreutils,
  // xml-twig-tools, xml-security-c-bin/-utils) are rescued via
  // config/filter-keep.json instead of narrowing this further. Surfaced
  // live investigating the apps "To Classify" bucket (2026-09-02): 87
  // real matches, all Perl/Haskell/OCaml/Java XML-processing libraries
  // except the four rescued tools.
  /^xml-/i,
  // Debian/Fedora/Arch's own "pick a default implementation" metapackage
  // convention — per-language font selectors (default-fonts-ar,
  // default-fonts-cjk-mono, ...) plus generic default-X selectors
  // (default-jdk, default-mysql-server, default-d-compiler,
  // default-editor, default-cursors) — none of these install anything
  // launchable themselves, they just pull in whatever the distro
  // currently considers the default X. Verified live: 86 real matches
  // across deb-debian/deb-ubuntu/pacman-arch/rpm-fedora, all metapackage
  // selectors, zero real standalone apps found.
  /^default-/,
  // Man-page translation/documentation packages (man-pages-ar, man-pages-fr,
  // man-pages-postgresql-ja, man-pages-posix, ...) — pure documentation,
  // never a launchable app, same reasoning as this file's `-docs?` suffix
  // pattern just as a prefix instead. Deliberately doesn't touch bare
  // "man" (the real command itself) or "man-db-*" (man-db's own service
  // components). Surfaced live investigating the apps "To Classify"
  // bucket (2026-09-02): 34 real matches, all documentation packages.
  /^man-pages(-|$)/i,
  // Two more CPAN capitalized-namespace conventions Gentoo mirrors
  // verbatim, same shape as the XML-* entry above — dist-git (lowercase,
  // Fedora's real DistGit source-control CLI) and class-widgets-bin
  // (lowercase, a real desktop app) are deliberately untouched since
  // this only matches the capitalized "Dist-"/"Class-" form. Surfaced
  // live investigating the apps "To Classify" bucket (2026-09-02): 59
  // real Dist-* matches (the Dist::Zilla release-tooling ecosystem) and
  // 54 real Class-* matches (Perl OOP/accessor-generation utility
  // modules), all libraries, zero non-Perl collisions in either.
  /^Dist-/,
  /^Class-/,
  // KDE's own Oxygen typeface family (oxygen-fonts, oxygen-fonts-common,
  // oxygen-mono-fonts, oxygen-sans-fonts) — carved out ahead of
  // config/category-rules.json's broader "oxygen*" theme entry, same
  // shape as intel-*-fonts/adwaita-fonts above. Surfaced live
  // investigating the apps "To Classify" bucket (2026-09-02).
  /^oxygen-(fonts|mono-fonts|sans-fonts)/,
  // The Greek Font Society's own typeface family (gfs-ambrosia-fonts,
  // gfs-baskerville-fonts, gfs-complutum-fonts, ...) — real fonts.
  // Surfaced live investigating the apps "To Classify" bucket
  // (2026-09-02): 30 real matches, all real Greek typefaces.
  /^gfs-.*fonts/i,
  // BPG's own Georgian typeface family (bpg-algeti-fonts,
  // bpg-classic-fonts, bpg-courier-fonts, ...) — real fonts. Surfaced
  // live investigating the apps "To Classify" bucket (2026-09-02): 33
  // real matches, all real Georgian typefaces.
  /^bpg-.*fonts/i,
  // Debian's own "Debian Games" tasksel genre-bucket metapackages
  // (games-arcade, games-puzzle, games-rpg, games-tasks itself literally
  // described as "Debian Games tasks for tasksel", ...) — same shape as
  // this file's task-/default- exclusions, never a launchable app.
  // Surfaced live investigating the apps "To Classify" bucket
  // (2026-09-02): 28 real matches (27 on Debian/Ubuntu plus Fedora's
  // equivalent games-menus submenu-categorization file), all metapackage
  // or menu-structure selectors, zero real standalone apps found.
  /^games-/,
];

/**
 * Best-effort guess that `name` is a library/dev/doc/font support package
 * rather than an app or game a user would search for — not a classifier,
 * just the auto-rule tier of filtering. See `config/filter-keep.json` and
 * `config/filter-exclude.json` for the escape hatches on either side.
 */
export function looksLikeSupportPackage(name: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(name));
}

// Phrases a package's own description uses to describe itself as a
// library/binding/module/dev-package — a signal `looksLikeSupportPackage`'s
// name patterns can't reach when the noise doesn't show up in the name
// itself (no `lib` prefix, no `-dev`/`-devel` suffix). Surfaced live
// investigating the apps "To Classify" bucket (2026-09-02), each verified
// against real random samples before being added:
// - `library for` / `a .* library` — 1,497 real matches, essentially all
//   real programming libraries (one soft exception found, cmdstan, which
//   also describes itself as "The command line interface to Stan" in the
//   same sentence — accepted as the same class of minor imprecision this
//   file already tolerates elsewhere, e.g. arm-fdisk under category-rules.json's
//   arm-* entry).
// - `bindings for` — 288 real matches, zero exceptions found (language
//   bindings for another library, never launchable on their own).
// - `module for` — 351 real matches, zero exceptions found (kernel/PAM/Qt/
//   SELinux modules, all needing a host).
// - `development files` — 939 real matches, zero exceptions found; this is
//   the exact text openSUSE/other RPM-family sources put in a `-devel`
//   package's own description, but many of those packages append an
//   architecture suffix after the marker (`foo-devel-32bit`), which slips
//   past this file's `-(dev|devel|...)$` *name* suffix pattern since
//   "devel" is no longer the final segment — the description text doesn't
//   have that problem.
// Deliberately NOT included after checking: `implementation of` (823 real
// matches, but a real exception rate too high to trust blanket — e.g. a
// real Home Assistant packaging phrases itself as "A snap implementation
// of the Home Assistant AiO"), `wrapper for` (326 real matches, but
// roughly half are real standalone wrapper apps, not libraries — e.g. a
// sandboxing tool for AI coding agents, a game auto-downloader), and
// `command line (tool|interface) for` (414 real matches, but this one
// would have excluded curl itself — "command line tool for transferring
// data with URL syntax" — real standalone CLI tools describe themselves
// this way just as often as ambiguous ones; too risky to exclude real
// apps entirely, unlike the milder harm of a miscategorization).
//
// `plugin for` / `extension for` / `framework for` / `addon for` (729 /
// 160 / 380 / 23 real matches) added alongside the original four: same
// "needs a host, not launchable on its own" litmus as a library, each
// verified live against real random samples first, zero exceptions found
// in any (Nagios/Roundcube/browser plugins, VSCode/Nautilus/MediaWiki
// extensions, C++/Tcl application frameworks, Kodi/Blender/Allegro
// addons).
const SUPPORT_DESCRIPTION_PATTERNS: RegExp[] = [
  /\blibrary for\b/i,
  /\bbindings for\b/i,
  /\bmodule for\b/i,
  /\bdevelopment files\b/i,
  /\bplugin for\b/i,
  /\bextension for\b/i,
  /\bframework for\b/i,
  /\baddon for\b/i,
];

/**
 * Best-effort guess from a package's own `description` text that it's a
 * library/binding/module/dev-package rather than an app or game — the
 * description-text counterpart to `looksLikeSupportPackage`'s name-based
 * guess, for the noise that doesn't show up in the name itself. Same
 * conservative discipline: only phrases verified live against real random
 * samples first, see this function's own comment above for what was
 * checked and rejected.
 */
export function looksLikeSupportDescription(description: string): boolean {
  return SUPPORT_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(description));
}

// Debian's own packaging convention: a `-source` suffix ships the actual
// source code (kernel-module sources for module-assistant/DKMS, compiler
// sources, library source archives) — never a launchable app. Verified
// live: 58 real matches on Debian alone, only one exception found
// (`apt-show-source`, a real CLI tool that shows info *about* source
// packages, not itself one — rescued via `config/filter-keep.json`).
// Deliberately Debian-family only (Ubuntu/Mint/Pop!_OS/Deepin/MX Linux
// share the identical deb822 packaging convention, same as this file's
// other Debian-Section notes) — checked AUR/Nixpkgs/openSUSE/Fedora too
// and the same suffix means something else entirely there: real OBS
// Studio plugins (`obs-gradient-source`, a video *input* source, not
// shipped source code), a real build-variant of a real app
// (`teamtalk-client-source`, "built from upstream source" — the same
// "alternate build channel" shape as AUR's own -git/-bin conventions,
// not noise), and more, so a source-agnostic pattern would have been
// wrong.
const DEBIAN_FAMILY_SOURCES = new Set<PackageSourceId>([
  "deb-debian",
  "deb-ubuntu",
  "deb-mint",
  "deb-popos",
  "deb-deepin",
  "deb-mxlinux",
]);

// Snapcraft/Ubuntu Core's own term of art: a "gadget snap" defines a
// board/device's boot configuration (bootloader, device tree, partition
// layout) — infrastructure, never launched. Verified live: all 6 real
// Snapcraft matches are board-support packages. Snapcraft-only: checked
// AUR/Nixpkgs too and "gadget" means something unrelated there
// (`kubectl-gadget`, a real Kubernetes troubleshooting CLI tool) — a
// source-agnostic pattern would have excluded a real tool.
const GADGET_SUFFIX = /-gadget$/;

// Debian's own "tasksel" metapackage convention: `task-<language>`
// (task-arabic, task-french, ...) and its `-desktop`/`-kde-desktop`/
// `-gnome-desktop` variants select a whole language environment or
// desktop for bulk install during setup — never a launchable app.
// Verified live: 230 real matches on Debian, 233 on Ubuntu (Mint/Pop!_OS/
// Deepin/MX Linux carry none at all), covering every language plus
// non-language tasksel selectors (task-laptop, task-ssh-server,
// task-web-server, task-astro-blend, task-blendsel, ...). Exactly one
// real exception found on both Debian and Ubuntu — `task-spooler`, a
// genuine standalone CLI batch-queue tool that happens to share the
// prefix — rescued via `config/filter-keep.json` rather than narrowing
// this to a language-name allowlist. Source-specific because AUR/
// Nixpkgs/Fedora's own `task-*` packages (task-manager, task-spooler-cpu,
// task-keeper, task-master-ai, ...) are real apps, not tasksel selectors.
const TASKSEL_PREFIX = /^task-/;

// AUR-specific cross-compilation convention: `android-<arch>-<name>`
// packages are libraries built *for* Android as a compile target
// (audio/video codecs, C++ utility libraries, UI component sets), not
// apps — verified live, every one of a 30-entry sample across several
// arches was a library, none launchable. Deliberately narrower than a
// blanket `android-` prefix, which was checked and rejected: real
// standalone tools share it too (`android-apktool`, `android-emulator`,
// `android-file-transfer`, ...). AUR-only: verified zero matches on any
// other source.
const ANDROID_CROSS_COMPILE_LIB = /^android-(aarch64|armv7a|riscv64|x86-64|x86)-/;

/**
 * Source-specific noise conventions `looksLikeSupportPackage` can't catch
 * on name alone, since the same shape means something different on other
 * sources (Debian's `-source` vs. AUR/Nixpkgs' real "input source"
 * plugins; Snapcraft's `-gadget` vs. Nixpkgs' real `kubectl-gadget` tool).
 * See each pattern's own comment above for the verification behind it.
 */
export function looksLikeSourceSpecificNoise(source: PackageSourceId, name: string): boolean {
  if (DEBIAN_FAMILY_SOURCES.has(source) && name.endsWith("-source")) return true;
  if (DEBIAN_FAMILY_SOURCES.has(source) && TASKSEL_PREFIX.test(name)) return true;
  if (source === "snap-snapcraft" && GADGET_SUFFIX.test(name)) return true;
  if (source === "pacman-aur" && ANDROID_CROSS_COMPILE_LIB.test(name)) return true;
  return false;
}

// Debian/Ubuntu's `Section` field (SourcedPackage.section — Fedora's RPM
// Group field is unused upstream in practice, "Unspecified" on real data;
// Arch's desc format has no equivalent at all) — an official, upstream
// classification the name-pattern rules above have no visibility into.
//
// Included — unambiguously support packages, no real exceptions found:
// - libs / libdevel / oldlibs — shared libraries, headers, transitional
//   compat packages.
// - doc — documentation, manuals, guides (including plain-text books
//   packaged as Debian docs, e.g. "anarchism" — not apps either).
// - debug — every entry is a "-dbg"/"debugging symbols for X" package.
// - introspection — GObject typelib data (gir1.2-*).
// - gnu-r — almost entirely r-cran-*/r-bioc-*/r-other-* library packages;
//   the few real exceptions (r-base itself, littler, ...) are allowlisted
//   by exact name instead of loosening this rule — see
//   config/filter-keep.json.
//
// Deliberately NOT included, despite being tempting (same "library
// ecosystem" framing as the patterns above) — real standalone tools mix
// in at a rate too high to blanket-exclude: python (black, bpython,
// cookiecutter, azure-cli, alembic, ...), perl (alice, biber, cme,
// cpan-listchanges, ...), golang (assetfinder, aws-nuke, cliphist,
// cobra-cli, cosign, ...), ruby (asciidoctor, batalert, ...), php
// (composer, cmsscanner, ...), java (activemq, ...), javascript, haskell
// (ghc, glirc, ...), ocaml, lisp (abcl, ...), devel (a56, abi-dumper,
// acme, ...), kernel (dt-utils, firmware/driver packages a user may
// genuinely want), interpreters (brandy, bwbasic, ...). Same reasoning as
// this file's rust-/golang- name-prefix exception above — these sections
// mix a language's own library ecosystem with genuine standalone tools
// written in it, and Section alone can't tell them apart.
const NOISE_SECTIONS = new Set([
  "libs",
  "libdevel",
  "oldlibs",
  "doc",
  "debug",
  "introspection",
  "gnu-r",
]);

// Nixpkgs reuses the same `section` slot for its attribute-path namespace
// prefix (e.g. `kdePackages.akregator` -> `kdePackages`), a differently-
// shaped value than Debian's fixed vocabulary — version-numbered variants
// are common (python313Packages, lua54Packages, rubyPackages_3_3,
// chickenPackages_5, ...), so a plain Set can't match them; patterns can.
// kdePackages was checked and *rejected* despite being tempting (same
// "distro packaging namespace" framing as Debian's Section) — it mixes
// real standalone apps (akregator, ark, arianna) with libraries
// (akonadi-contacts, accounts-qt) at too high a rate.
// "*Packages" is NOT a safe general suffix: kdePackages mixes real apps
// with libraries as above, and php83Packages/phpPackages contain real
// standalone tools (composer, psalm, phpmd, php-cs-fixer) right next to
// phpXXExtensions' pure PECL extensions. Every entry below is
// individually verified, not inferred from the suffix alone.
const NIX_NOISE_PREFIX_PATTERNS: RegExp[] = [
  // Language/ecosystem package sets, overwhelmingly modules not standalone
  // tools: R (CRAN mirror), Haskell (Hackage mirror), Python (PyPI
  // mirror, any interpreter version), Perl (CPAN mirror), OCaml (opam
  // mirror), Common Lisp (SBCL/Chicken/Akku package sets), Lua, Ruby (any
  // version), TeX Live (LaTeX packages), Typst (template/library
  // packages) — none of these are apps.
  /^rPackages$/,
  /^haskellPackages$/,
  /^py(thon|py)\d*Packages$/,
  /^perl5?Packages$/,
  /^ocamlPackages(_\w+)?$/,
  /^sbclPackages$/,
  /^chickenPackages(_\d+)?$/,
  /^akkuPackages$/,
  /^lua\d*Packages$/,
  /^rubyPackages(_\d+_\d+)?$/,
  /^texlivePackages$/,
  /^typstPackages$/,
  // Toolchain/library component sets verified individually (unlike the
  // "*Packages" suffix in general, see this const's header comment):
  // Qt6 bindings (unlike kdePackages, no real apps mixed in), Wine build
  // components, Godot export templates, and PostgreSQL extensions (any
  // major-version-numbered variant).
  /^qt6Packages$/,
  /^wine(64|WoW64)?Packages$/,
  /^godotPackages(_[\w.]+)?$/,
  /^postgresql\d*Packages$/,
  // Plugins/extensions for a host app the user needs already installed —
  // not independently launchable, same "would a user launch this on its
  // own" litmus test as config/README.md's filter-keep.json guidance
  // (mirrors the libretro-core/browser-extension exclusions decided
  // there for AppImageHub-derived names). Verified as a safe general
  // pattern across many different host-app namespaces (fish, tmux, vim,
  // obs-studio, netbox, roundcube, gimp, elasticsearch, grafana, ...).
  /plugins?$/i,
  /extensions?$/i,
  // Not applications at all, by construction: editor package sets
  // (emacs' own package ecosystem, itself plugin-shaped even without
  // matching the pattern above), syntax-highlighting grammars, kernel
  // builds/modules (any variant — xanmod/zen/latest/...), Android SDK/
  // build-environment components, dictionaries, and Terraform provider
  // plugins.
  /^emacsPackages$/,
  /^tree-sitter-grammars$/,
  /^linux(Kernel|Packages(_[\w.]+)?)$/,
  /^androidenv$/,
  /^(hyphen|hunspell)Dicts$/,
  /^terraform-providers$/,
];

// openSUSE reuses the same `section` slot for its hierarchical RPM
// `<rpm:group>` value (e.g. `System/Libraries`, `Documentation/HTML`) — see
// SourcedPackage.section. Hit the exact same trap Debian's "devel"/
// "kernel"/language sections and Nixpkgs' `kdePackages` did —
// `Development/Libraries/*` and `Development/Languages/*` were checked and
// *rejected* despite the tempting "just libraries" framing: real
// standalone tools turned up in every one sampled (clisp, love, act,
// typescript, codespell, dialog, ...), same "language ecosystem mixes in
// real tools" reasoning as Debian's python/perl/golang sections.
//
// Included — unambiguously support packages, with one exception across
// all six groups (Metapackages' "seidl", a real standalone monitoring
// client mixed in among patterns-*/installation-images-*/skelcd-*
// install-time metapackages — allowlisted by exact name in
// config/filter-keep.json rather than loosening this rule, same as Debian's
// gnu-r r-base/littler):
// - System/Libraries — shared libraries and runtime plugins.
// - Documentation/HTML / Documentation/Other — javadoc, manuals, API docs.
// - System/X11/Fonts — font packages.
// - System/Localization — `-lang`/translation packages.
// - Metapackages — `patterns-*` desktop/server install selections,
//   `installation-images-*`, `skelcd-*` — install-time bundles, not apps.
const OPENSUSE_NOISE_GROUPS = new Set([
  "System/Libraries",
  "Documentation/HTML",
  "Documentation/Other",
  "System/X11/Fonts",
  "System/Localization",
  "Metapackages",
]);

// Slackware reuses the same `section` slot for its package "series" — a
// short component code from PACKAGE LOCATION (e.g. `l`, `kde`, `xfce`,
// `y`). Far coarser than Debian's Section vocabulary (15 series total).
// Every series other than the two below mixes real standalone apps with
// libraries at a rate too high to blanket-exclude — same trap as
// everywhere else this file documents it, just under Slackware's own
// naming: `d` (development — bison, python-pip, cargo-c mixed with pure
// dev libraries), `a` (base — xz, efibootmgr, usbutils are real CLI
// tools), `n` (network — alpine, dhcpcd, gnupg, httpd, ethtool are real
// tools), `x`/`xap`/`xfce`/`kde` (desktop-environment series mixing real
// GUI apps with their own libraries, e.g. kompare/kontact/plasma-workspace
// vs. kmime/kpeoplevcard). `y` (games), `t`/`tcl` (TeX/Tcl), and `e`
// (only emacs, emacspeak, both real apps) were also checked and kept.
//
// Included — safe after sampling:
// - `l` (libraries) — one real exception found (`glade`, a real
//   standalone GUI UI designer despite the "l" series) — allowlisted by
//   exact name in config/filter-keep.json rather than loosening this rule,
//   same as Debian's gnu-r r-base/littler and openSUSE's
//   Metapackages/seidl.
// - `f` (FAQs/docs — only linux-faqs, linux-howtos, both pure
//   documentation).
const SLACKWARE_NOISE_SERIES = new Set(["l", "f"]);

// Solus reuses the same `section` slot for its `PartOf` value — a dotted
// hierarchical grouping (e.g. `games.strategy`, `programming.library`).
// Hit the same language/toolchain-ecosystem trap as everywhere else —
// `programming.*` buckets other than the two below (`.devel`, `.python`,
// `.perl`, `.tools`, and bare `programming`) mix real tools in, and even
// `programming.devel` (almost entirely already `-devel`-suffixed and so
// already caught by name pattern regardless) has a small tail of real
// tools among the un-suffixed remainder (gcc-13, dpkg, mingw-w64,
// rocm-info) — not worth the risk for zero marginal catch. `system.base`
// was checked too: real CLI tools (zstd, gzip) sit right next to pure
// libraries (glibc, libdw, mpfr), same trap.
//
// Included — safe after sampling, one real exception found overall:
// - `debug` — every sampled entry is a `-dbginfo` package.
// - `programming.library` / `desktop.library` / `multimedia.library` —
//   library packages. `desktop.library` had one real exception —
//   `dcraw`, a standalone command-line raw photo converter despite the
//   "library" grouping — allowlisted by exact name rather than loosening
//   this rule, same pattern as Slackware's `glade`.
// - `programming.docs` — documentation packages.
// - `desktop.theme` — icon/GTK/Qt themes, not launchable apps.
// - `emul32` — 32-bit compat libraries (`-32bit`-suffixed).
const SOLUS_NOISE_PARTOF = new Set([
  "debug",
  "programming.library",
  "programming.docs",
  "desktop.library",
  "multimedia.library",
  "desktop.theme",
  "emul32",
]);

// Gentoo reuses the same `section` slot for its top-level category (e.g.
// `games-strategy`, `dev-libs`) — same trap as everywhere else for most
// categories (dev-*/app-* mix real tools with libraries), but several are
// unambiguous no matter how sampled: `acct-group`/`acct-user` (every one
// a "System group: X"/"A group for Y" system-account definition — not
// software at all, discovered because they were surviving the filter and
// polluting cross-source name matches, e.g. "acct-group/clock" merging
// into the real "Clock" app group), `virtual` (every one a "Virtual for
// X" dependency-resolution abstraction Portage uses to pick between
// providers, e.g. `virtual/jre`, `virtual/editor` — never a real
// launchable package itself), and five more found live sweeping the
// broader "To Classify" set for the same shape this file already
// excludes elsewhere by name: `sec-keys` (openpgp-keys-* signing-key
// bundles, same as noise everywhere else), `app-dicts` (per-language
// aspell/mecab dictionary data), `x11-themes` (backgrounds/icon themes/
// skins, not apps), `media-fonts` (font files), and `app-emacs` (Emacs
// Lisp packages — needs Emacs itself as a host, same reasoning as this
// file's `elpa-` pattern, which is Debian/Fedora's name for the identical
// concept). One more found live investigating the apps "To Classify"
// bucket (2026-09-02): `dev-perl` (the whole CPAN-mirroring category
// this file's `^XML-`/`^Dist-`/`^Class-` patterns above only chip away
// at a few naming shapes of) — 1,776 real matches, overwhelmingly Perl
// distribution modules, no host app of their own; the one real
// exception found (`Perl-Tidy`, which ships the standalone `perltidy`
// script) is rescued via `config/filter-keep.json` rather than trying
// to carve exceptions out of the category wholesale. Two more of the
// same "needs a host editor, not launchable on its own" shape as
// app-emacs found alongside it: `app-vim` (Vim plugins — syntax
// highlighting, statuslines, language-specific tooling, all needing Vim
// itself) and `app-xemacs` (XEmacs Lisp packages, same concept as
// app-emacs for the XEmacs fork specifically). Verified live: 189 real
// app-vim matches, 130 real app-xemacs matches, no exceptions found in
// either. Five more found live sweeping other Gentoo categories for the
// same "whole category is noise" shape as dev-perl (2026-09-02):
// `app-doc` (pure documentation/manuals/references — devmanual, tldp-howto,
// python-docs, ... — 46 real matches, zero launchable apps), `kde-frameworks`
// (KDE's own Frameworks library modules — karchive, kcoreaddons, solid,
// ... — 78 real matches, every one a dependency library, none launchable
// on its own), and three library-only categories whose real content
// mostly already rides the existing `^lib` prefix but that also catch
// non-`lib`-prefixed library packages that prefix pattern misses
// (fltk, qscintilla, wxGTK, gtk-vnc, tdb, zlib, readline, ...):
// `x11-libs` (103 real matches), `net-libs` (178 real matches), `sys-libs`
// (81 real matches) — each hand-checked for a real standalone app hiding
// among them via a "gui/viewer/player/editor, not a library/framework"
// keyword sweep, zero exceptions found in any of the five.
const GENTOO_NOISE_CATEGORIES = new Set([
  "acct-group",
  "acct-user",
  "virtual",
  "sec-keys",
  "app-dicts",
  "x11-themes",
  "media-fonts",
  "app-emacs",
  "app-vim",
  "app-xemacs",
  "app-doc",
  "kde-frameworks",
  "x11-libs",
  "net-libs",
  "sys-libs",
  "dev-perl",
]);

/** Best-effort guess from Debian/Ubuntu's `Section` field, nixpkgs' attribute-path prefix, openSUSE's `<rpm:group>` value, Slackware's package series, Solus's `PartOf` value, or Gentoo's category, alongside `looksLikeSupportPackage`'s name-based guess — see this file's comments on `NOISE_SECTIONS`/`NIX_NOISE_PREFIX_PATTERNS`/`OPENSUSE_NOISE_GROUPS`/`SLACKWARE_NOISE_SERIES`/`SOLUS_NOISE_PARTOF`/`GENTOO_NOISE_CATEGORIES` for which values are safe. */
export function looksLikeSupportSection(section: string | undefined): boolean {
  if (section === undefined) return false;
  return (
    NOISE_SECTIONS.has(section) ||
    NIX_NOISE_PREFIX_PATTERNS.some((p) => p.test(section)) ||
    OPENSUSE_NOISE_GROUPS.has(section) ||
    SLACKWARE_NOISE_SERIES.has(section) ||
    GENTOO_NOISE_CATEGORIES.has(section) ||
    SOLUS_NOISE_PARTOF.has(section)
  );
}

// Debian/Ubuntu Section values that predict a real, launchable GUI app —
// the weaker half of the "GUI vs CLI classification" card, alongside
// `SourcedPackage.hasDesktopFile` (Fedora/openSUSE's direct signal). No
// equivalent synthetic desktop-file marker exists in Debian's Packages.gz,
// so this leans on Section instead — verified by cross-tabulating every
// real Debian/Ubuntu Section value against apps *already* known to be GUI
// via the Fedora/openSUSE signal.
//
// Included — well above baseline *and* manually sampled clean — every
// "not flagged gui" entry checked in these sections is either a real CLI
// tool (ani-cli, aravis-tools-cli, ax25-apps) or a companion data/plugin/
// server package for an app already captured elsewhere (see
// GUI_SECTION_EXCLUDE_PATTERNS below), never a mislabeled real app:
// sound, editors, video, graphics, math, science, hamradio, games,
// contrib/games.
//
// Deliberately NOT included despite comparably high raw rates — manual
// sampling turned up real desktop-environment theme/icon/plugin packages
// riding along in these sections that this heuristic can't tell apart
// from real apps by Section alone (adwaita-icon-theme, adwaita-qt6,
// breeze-icon-theme, breeze-cursor-theme, arc-kde, Numix Circle Icons,
// thunar-font-manager, xfce4-battery-plugin, ...) — same "look at real
// samples, not just the percentage" trap NOISE_SECTIONS' header comment
// describes for kdePackages/Development/*: x11, gnome, kde, xfce.
const GUI_SECTIONS = new Set([
  "sound",
  "editors",
  "video",
  "graphics",
  "math",
  "science",
  "hamradio",
  "games",
  "contrib/games",
]);

// Companion data/plugin/server packages that ride along under the same
// GUI_SECTIONS value as the real app they belong to (0ad-data next to 0ad,
// ardour-lv2-plugins next to ardour, bzflag-server next to bzflag) but
// aren't themselves a launchable GUI app — none of these suffixes are
// caught by `looksLikeSupportPackage`'s NOISE_PATTERNS, which is scoped to
// dev/debug/doc/lib/font/language-module naming, not this.
const GUI_SECTION_EXCLUDE_PATTERNS: RegExp[] = [
  /-data$/,
  /-common$/,
  /-plugins?$/,
  /-server$/,
  /-icons?$/,
];

/**
 * Best-effort guess that a Debian/Ubuntu package (`SourcedPackage.section`)
 * is a real, launchable GUI app — the weaker counterpart to
 * `SourcedPackage.hasDesktopFile`. Callers should only apply this to
 * `source: "deb-debian" | "deb-ubuntu"` packages: other sources reuse the same
 * `section` slot for unrelated vocabularies (see this file's other
 * per-distro Section comments) that were never checked against
 * GUI_SECTIONS.
 */
export function looksLikeGuiPackage(name: string, section: string | undefined): boolean {
  if (section === undefined || !GUI_SECTIONS.has(section)) return false;
  if (looksLikeSupportPackage(name)) return false;
  return !GUI_SECTION_EXCLUDE_PATTERNS.some((pattern) => pattern.test(name));
}

// Debian's own top-level `games` Section, plus its component-prefixed
// variants — `contrib/games`/`non-free/games`. Debian's own normalize.ts
// passes `section` straight through (unlike Ubuntu's, which strips the
// `<component>/` prefix down to the bare value — see deb-ubuntu's
// `normalizeSection`), so Debian's real `SourcedPackage.section` keeps
// the prefixed form while Ubuntu's is always bare "games" by the time it
// gets here; `universe/games`/`multiverse/games` are listed anyway as a
// harmless safety net in case that ever changes. Mint/Pop!_OS/Deepin/MX
// Linux reuse Debian's unstripped pass-through, not Ubuntu's — same
// reasoning as `looksLikeSupportSection`'s NOISE_SECTIONS. Real Debian
// and Ubuntu `games`-section entries checked are always real games or a
// real game's own companion data/server package (0ad-data,
// sauerbraten-server, ...) — never something unrelated.
const DEB_FAMILY_GAME_SECTIONS = new Set([
  "games",
  "contrib/games",
  "non-free/games",
  "universe/games",
  "multiverse/games",
]);
const DEB_FAMILY_GAME_SOURCES = new Set<PackageSourceId>([
  "deb-debian",
  "deb-ubuntu",
  "deb-mint",
  "deb-popos",
  "deb-deepin",
  "deb-mxlinux",
]);

/**
 * Best-effort guess that a package (`SourcedPackage.section`) is a game,
 * across every source whose Section-equivalent field has its own games
 * grouping — the counterpart to `SourcedPackage.hasGameCategory` (Flathub/
 * AppCenter's direct AppStream signal). Each source's own vocabulary,
 * checked against real data before trusting it, same discipline as
 * `looksLikeGuiPackage`/`looksLikeSupportSection`:
 * - Debian family (see `DEB_FAMILY_GAME_SECTIONS`/`_SOURCES`).
 * - Gentoo's `games-*` category prefix (e.g. `games-strategy`,
 *   `games-fps`) — Gentoo's own top-level category effectively *is* its
 *   app classification, unlike Debian's Section; real entries checked are
 *   all games or a game's own data/server sub-package.
 * - openSUSE's `Amusements/Games` `<rpm:group>` prefix — all games, plus
 *   a couple of gaming-adjacent tools openSUSE itself groups here (e.g.
 *   `PlayOnLinux`, close enough to not chase further). RPM Fusion reuses
 *   the identical `Amusements/Games` prefix and convention — real games on
 *   real data too (gltron, stepmania, doom-shareware, ...).
 * - Solus's `games.*`/`games` `PartOf` value — all games or
 *   gaming-adjacent tools Solus itself groups here (e.g. `antimicrox`,
 *   a joystick-to-keyboard mapper).
 * - AUR's own `gog-` name prefix (AUR carries no Section-equivalent field
 *   at all, so this is a name check, not a section one) — community
 *   packaging wrappers around a real GOG.com game installer (gog-deponia,
 *   gog-stardew-valley, gog-x4_foundations, ...). Surfaced live
 *   investigating the apps "To Classify" bucket (2026-09-02): 146 real
 *   matches, every one sampled a real GOG game (including several whose
 *   own description doesn't use the word "game" at all, e.g.
 *   gog-a-short-hike, gog-hypnospace-outlaw), zero false positives.
 * - AUR's own `pzl_` name prefix — a single coherent puzzle-game suite
 *   (pzl_sudoku, pzl_sokoban, pzl_wordladder, ...) with a shared
 *   `pzl_common` data package, same "no Section field, name is the only
 *   signal" reasoning as `gog-`. Verified live: 42 real matches, every one
 *   a real logic/word puzzle (or that suite's own data package).
 * - AUR's own `minetest-` and `openra-` name prefixes — individual
 *   community subgames/mods for the Minetest voxel-sandbox engine and
 *   the OpenRA real-time-strategy engine, neither of which carries a
 *   Section field on AUR any more than gog-/pzl_ do. Verified live:
 *   93 real matches, every one a real Minetest subgame (minetest-alter,
 *   minetest-arcade3d, ...) or OpenRA mod (openra-ca-git, openra-d2-git,
 *   ...) — the base engines themselves (bare `minetest`/`openra`) are
 *   already detected via Flathub's own hasGameCategory, unaffected by
 *   this prefix check.
 * Not (yet) checked: Slackware's `y` series has too few real entries —
 * too small a sample to trust either way, left out for now.
 */
export function looksLikeGamePackage(
  source: PackageSourceId,
  section: string | undefined,
  name: string,
): boolean {
  if (
    source === "pacman-aur" &&
    (name.startsWith("gog-") ||
      name.startsWith("pzl_") ||
      name.startsWith("minetest-") ||
      name.startsWith("openra-"))
  ) {
    return true;
  }
  if (section === undefined) return false;
  if (DEB_FAMILY_GAME_SOURCES.has(source)) return DEB_FAMILY_GAME_SECTIONS.has(section);
  if (source === "ebuild-gentoo") return section.startsWith("games-");
  if (source === "rpm-opensuse" || source === "rpm-rpmfusion") {
    return section.startsWith("Amusements/Games");
  }
  if (source === "eopkg-solus") return section === "games" || section.startsWith("games.");
  return false;
}
