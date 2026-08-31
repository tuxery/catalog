import { describe, expect, it } from "vitest";
import {
  looksLikeGamePackage,
  looksLikeGuiPackage,
  looksLikeSourceSpecificNoise,
  looksLikeSupportPackage,
  looksLikeSupportSection,
} from "./rules";

describe("looksLikeSupportPackage", () => {
  it("flags dev/debug/doc suffixes", () => {
    expect(looksLikeSupportPackage("libfoo-dev")).toBe(true);
    expect(looksLikeSupportPackage("myapp-dbg")).toBe(true);
    expect(looksLikeSupportPackage("myapp-dbgsym")).toBe(true);
    expect(looksLikeSupportPackage("myapp-doc")).toBe(true);
    expect(looksLikeSupportPackage("myapp-docs")).toBe(true);
  });

  it("flags Fedora-style dev/debug suffixes", () => {
    expect(looksLikeSupportPackage("zlib-devel")).toBe(true);
    expect(looksLikeSupportPackage("glibc-debuginfo")).toBe(true);
    expect(looksLikeSupportPackage("glibc-debugsource")).toBe(true);
  });

  it("flags lib-prefixed packages, including soname-versioned ones", () => {
    expect(looksLikeSupportPackage("libssl3")).toBe(true);
    expect(looksLikeSupportPackage("libgtk-3-0")).toBe(true);
    // Not soname-versioned, but still a library — the old digit-suffix-only
    // pattern missed these (56k+ across sources, see filter/rules.ts).
    expect(looksLikeSupportPackage("libcurl")).toBe(true);
    expect(looksLikeSupportPackage("libaio")).toBe(true);
  });

  it("flags Fedora's -libs and -static suffixes", () => {
    expect(looksLikeSupportPackage("zlib-libs")).toBe(true);
    expect(looksLikeSupportPackage("glibc-static")).toBe(true);
  });

  it("flags font packages", () => {
    expect(looksLikeSupportPackage("fonts-cantarell")).toBe(true);
    expect(looksLikeSupportPackage("ttf-mscorefonts-installer")).toBe(true);
  });

  it("flags Fedora-style Perl/OCaml/Haskell/Lua/R/Tcl module packages", () => {
    expect(looksLikeSupportPackage("perl-DBI")).toBe(true);
    expect(looksLikeSupportPackage("ocaml-astring")).toBe(true);
    expect(looksLikeSupportPackage("ghc-Cabal")).toBe(true);
    expect(looksLikeSupportPackage("lua-cqueues")).toBe(true);
    expect(looksLikeSupportPackage("R-DBI")).toBe(true);
    expect(looksLikeSupportPackage("tcl-snack")).toBe(true);
  });

  it("flags Fedora's own per-GHC-version variant of the ghc- module-package convention", () => {
    expect(looksLikeSupportPackage("ghc9.10-base")).toBe(true);
    expect(looksLikeSupportPackage("ghc9.2-Cabal-prof")).toBe(true);
  });

  it("flags real apps that happen to start with lib — rescued via overrides, not by pattern", () => {
    // A bare `^lib` prefix is deliberately broad now (see filter/rules.ts's
    // header comment) — LibreOffice/LibreCAD are real exceptions, but they
    // go through config/filter-keep.json by exact name, not a smarter regex.
    // Extending the regex to also spare them doesn't scale: 1,200+ other
    // `libre*` names are coincidentally "lib" + a word starting with "re"
    // (libreadline, librealsense, librecast, ...), not real "Libre"-branded
    // apps, so no name-only pattern can tell them apart.
    expect(looksLikeSupportPackage("libreoffice")).toBe(true);
    expect(looksLikeSupportPackage("libreoffice-writer")).toBe(true);
    expect(looksLikeSupportPackage("librecad")).toBe(true);
  });

  it("does not flag ordinary app/game/CLI-tool names", () => {
    expect(looksLikeSupportPackage("firefox")).toBe(false);
    expect(looksLikeSupportPackage("gimp")).toBe(false);
    expect(looksLikeSupportPackage("ripgrep")).toBe(false);
    expect(looksLikeSupportPackage("0ad")).toBe(false);
  });

  it("flags GNOME Shell extensions", () => {
    expect(looksLikeSupportPackage("gnome-shell-extension-dash-to-panel")).toBe(true);
    expect(looksLikeSupportPackage("gnome-shell-extension-appindicator")).toBe(true);
  });

  it("rescues the real GNOME Shell extension-manager/-installer tools, not extensions themselves", () => {
    // Real standalone apps despite the noise prefix — see
    // config/filter-keep.json.
    expect(looksLikeSupportPackage("gnome-shell-extension-manager")).toBe(true);
    expect(looksLikeSupportPackage("gnome-shell-extension-installer")).toBe(true);
  });

  it("flags KWin effects/styles/decorations, not the compositor itself", () => {
    expect(looksLikeSupportPackage("kwin-effects-burn-my-windows")).toBe(true);
    expect(looksLikeSupportPackage("kwin-style-breeze")).toBe(true);
    expect(looksLikeSupportPackage("kwin-decoration-oxygen")).toBe(true);
    expect(looksLikeSupportPackage("kwin")).toBe(false);
    expect(looksLikeSupportPackage("kwin-x11")).toBe(false);
    expect(looksLikeSupportPackage("kwindowsystem")).toBe(false);
  });

  it("flags Plasma applets/plasmoids in both prefix and suffix naming forms", () => {
    expect(looksLikeSupportPackage("plasma6-applets-appgrid")).toBe(true);
    expect(looksLikeSupportPackage("plasma-applet-commandoutput")).toBe(true);
    expect(looksLikeSupportPackage("kalgebra-plasmoid")).toBe(true);
    expect(looksLikeSupportPackage("kalgebra-plasma-applet")).toBe(true);
    expect(looksLikeSupportPackage("fancontrol-plasmoid-git")).toBe(true);
  });

  it("flags only COSMIC's applet subset, not the broader cosmic-ext- prefix", () => {
    // Verified live: cosmic-ext- also covers real standalone third-party
    // COSMIC apps (calculator, tweaks, control-center, ...), not just
    // panel applets — a blanket prefix would have wrongly excluded those.
    expect(looksLikeSupportPackage("cosmic-ext-applet-weather")).toBe(true);
    expect(looksLikeSupportPackage("cosmic-ext-calculator")).toBe(false);
    expect(looksLikeSupportPackage("cosmic-ext-tweaks")).toBe(false);
  });

  it("flags DKMS kernel modules — never launched on their own, same as a library", () => {
    expect(looksLikeSupportPackage("nvidia-580xx-dkms")).toBe(true);
    expect(looksLikeSupportPackage("acpi-call-dkms")).toBe(true);
    expect(looksLikeSupportPackage("bbswitch-dkms")).toBe(true);
    expect(looksLikeSupportPackage("8188eu-dkms-git")).toBe(true);
    // Verified live: real driver variants tag a version/suffix after
    // "dkms" rather than ending there (Ubuntu's own nvidia-dkms-535-open,
    // AUR's nvidia-340xx-dkms-macbook), so the pattern can't be a strict
    // suffix match.
    expect(looksLikeSupportPackage("nvidia-dkms-535-open")).toBe(true);
    expect(looksLikeSupportPackage("nvidia-340xx-dkms-macbook")).toBe(true);
  });

  it("flags SDK-shaped names — verified live: overwhelmingly per-service API client libraries or build kits, not launchable tools", () => {
    expect(looksLikeSupportPackage("aws-sdk-cpp-accessanalyzer")).toBe(true);
    expect(looksLikeSupportPackage("aliyun-python-sdk")).toBe(true);
    expect(looksLikeSupportPackage("py3-sentry-sdk")).toBe(true);
    expect(looksLikeSupportPackage("plasma-sdk")).toBe(true);
    expect(looksLikeSupportPackage("android-sdk-build-tools")).toBe(true);
    // The real exceptions (dotnet-sdk, wasi-sdk, google-cloud-sdk, bare
    // android-sdk) still match this name pattern — the rescue happens via
    // config/filter-keep.json, same layering as the libreoffice/
    // gnome-shell-extension-manager exceptions elsewhere in this file.
    expect(looksLikeSupportPackage("dotnet-sdk")).toBe(true);
    expect(looksLikeSupportPackage("android-sdk")).toBe(true);
  });

  it("flags -module-suffixed names — verified live across 8 sources: GTK input-method modules, kernel modules, Node.js CommonJS modules, and host-app plugin modules, never a launchable app", () => {
    expect(looksLikeSupportPackage("accounts-qml-module")).toBe(true);
    expect(looksLikeSupportPackage("webcamstudio-module")).toBe(true);
    expect(looksLikeSupportPackage("appmenu-gtk3-module")).toBe(true);
    expect(looksLikeSupportPackage("node-is-module")).toBe(true);
    expect(looksLikeSupportPackage("gtklock-dpms-module")).toBe(true);
  });

  it("flags language/translation-pack suffixes — verified live: a large, previously-undiscovered noise leak (271 -l10n- on Debian, 869 -langpack- on Fedora for one app alone, 190 -locale- on Ubuntu, 1,831 bare -lang on Alpine) that was burying real, well-merged apps like Firefox/VLC in search results", () => {
    expect(looksLikeSupportPackage("firefox-esr-l10n-af")).toBe(true);
    expect(looksLikeSupportPackage("libreoffice-l10n-ca-valencia")).toBe(true);
    expect(looksLikeSupportPackage("firefox-locale-en")).toBe(true);
    expect(looksLikeSupportPackage("avogadro2-langpack-en_AU")).toBe(true);
    expect(looksLikeSupportPackage("akregator-lang")).toBe(true);
    expect(looksLikeSupportPackage("inkscape-lang")).toBe(true);
    // Arch/AUR/Void's own -i18n- marker for the same concept — found
    // investigating the real firefox-bin bug report, 608 real matches.
    expect(looksLikeSupportPackage("firefox-esr-i18n-af")).toBe(true);
    expect(looksLikeSupportPackage("firefox-developer-edition-i18n-zh-cm")).toBe(true);
    // Real apps themselves are untouched — only the per-language suffix
    // form matches.
    expect(looksLikeSupportPackage("firefox")).toBe(false);
    expect(looksLikeSupportPackage("vlc")).toBe(false);
  });

  it("flags Alpine's -pyc precompiled-bytecode suffix — verified live: 1,864 matches, always a build artifact of an already-captured package", () => {
    expect(looksLikeSupportPackage("py3-adblock-pyc")).toBe(true);
    expect(looksLikeSupportPackage("py3-sqlparse-pyc")).toBe(true);
  });

  it('flags NVIDIA\'s per-driver-branch utilities package — verified live: 14 real matches, all "NVIDIA drivers utilities" bundling shared graphics libraries plus one CLI tool riding along, never itself launchable', () => {
    expect(looksLikeSupportPackage("nvidia-utils")).toBe(true);
    expect(looksLikeSupportPackage("nvidia-580xx-utils")).toBe(true);
    expect(looksLikeSupportPackage("nvidia-340xx-utils")).toBe(true);
    expect(looksLikeSupportPackage("nvidia-vulkan-utils")).toBe(true);
    // Deliberately narrow — a blanket -utils pattern has real
    // counter-examples (rejected elsewhere): bridge-utils, cifs-utils,
    // alsa-utils are real standalone tools, and this pattern must not
    // touch them.
    expect(looksLikeSupportPackage("bridge-utils")).toBe(false);
    expect(looksLikeSupportPackage("alsa-utils")).toBe(false);
  });

  it("flags Brave's adblock-parsing library under every distro's Python-binding naming convention — verified live across 5 sources, zero counter-examples, replaces what used to be a one-exact-name-per-source override that would have needed a new line every Python release", () => {
    expect(looksLikeSupportPackage("python-adblock")).toBe(true);
    expect(looksLikeSupportPackage("python3-adblock")).toBe(true);
    expect(looksLikeSupportPackage("python313-adblock")).toBe(true);
    expect(looksLikeSupportPackage("python314-adblock")).toBe(true);
    expect(looksLikeSupportPackage("py3-adblock")).toBe(true);
    // Scoped to the compound name only — a bare python-prefix is
    // deliberately not a general pattern elsewhere in this file (real CLI
    // tools use it too), so an unrelated python package must stay untouched.
    expect(looksLikeSupportPackage("python3-requests")).toBe(false);
  });

  it('flags profile-sync-daemon\'s per-browser support-config packages — verified live: 8 real matches, all "<app> support for profile-sync-daemon", replaces what used to be a one-exact-name-per-app override', () => {
    expect(looksLikeSupportPackage("profile-sync-daemon-zen")).toBe(true);
    expect(looksLikeSupportPackage("profile-sync-daemon-floorp")).toBe(true);
    expect(looksLikeSupportPackage("profile-sync-daemon-edge-stable")).toBe(true);
    expect(looksLikeSupportPackage("profile-sync-daemon-zotero")).toBe(true);
    // The base tool and its own real build variants must stay untouched —
    // profile-sync-daemon itself is a real, standalone CLI tool.
    expect(looksLikeSupportPackage("profile-sync-daemon")).toBe(false);
    expect(looksLikeSupportPackage("profile-sync-daemon-git")).toBe(false);
    expect(looksLikeSupportPackage("profile-sync-daemon-openrc-git")).toBe(false);
  });

  it("flags GNU R's CRAN/Bioconductor/other name-prefix convention, the non-Debian equivalent of the gnu-r Section rule", () => {
    expect(looksLikeSupportPackage("r-cran-getopt")).toBe(true);
    expect(looksLikeSupportPackage("r-bioc-hilbertvis")).toBe(true);
    expect(looksLikeSupportPackage("r-other-something")).toBe(true);
  });

  it("flags MinGW's Windows cross-compilation target packages — never runnable on the Linux host regardless of name", () => {
    expect(looksLikeSupportPackage("mingw32-gcc")).toBe(true);
    expect(looksLikeSupportPackage("mingw64-gvnc-tools")).toBe(true);
    expect(looksLikeSupportPackage("mingw-w64-pybind11")).toBe(true);
  });

  it("flags Qt5/Qt6 and KDE Frameworks 6's own internal component packages", () => {
    expect(looksLikeSupportPackage("qt5-multimedia")).toBe(true);
    expect(looksLikeSupportPackage("qt6-qtbase-mysql")).toBe(true);
    expect(looksLikeSupportPackage("kf6-kio")).toBe(true);
  });

  it("flags Emacs Lisp Package Archive packages — need Emacs itself as a host", () => {
    expect(looksLikeSupportPackage("elpa-treemacs")).toBe(true);
  });

  it("flags Hunspell/MySpell dictionaries and Fedora's langpacks- prefix", () => {
    expect(looksLikeSupportPackage("hunspell-es")).toBe(true);
    expect(looksLikeSupportPackage("myspell-en_JM")).toBe(true);
    expect(looksLikeSupportPackage("langpacks-core-am")).toBe(true);
    expect(looksLikeSupportPackage("langpack-fr")).toBe(true);
  });

  it("flags SELinux policy module packages — need SELinux itself as a host", () => {
    expect(looksLikeSupportPackage("selinux-wireguard")).toBe(true);
  });

  it("flags TeX Live's macro/style/class package convention", () => {
    expect(looksLikeSupportPackage("texlive-euler")).toBe(true);
    expect(looksLikeSupportPackage("texlive-supertabular")).toBe(true);
  });

  it("flags only Xorg's unambiguous driver/font/build-macro sub-conventions, not the bare xorg- prefix real diagnostic tools also use", () => {
    expect(looksLikeSupportPackage("xorg-x11-drv-wacom")).toBe(true);
    expect(looksLikeSupportPackage("xorg-fonts-100dpi-otb")).toBe(true);
    expect(looksLikeSupportPackage("xorg-util-macros")).toBe(true);
    expect(looksLikeSupportPackage("xorg-xev")).toBe(false);
    expect(looksLikeSupportPackage("xorg-xwininfo")).toBe(false);
  });

  it("flags openSUSE's YaST2 -trans- translation packages, the same shape as -l10n-/-langpack-/-locale-/-i18n-", () => {
    expect(looksLikeSupportPackage("yast2-trans-fr")).toBe(true);
    expect(looksLikeSupportPackage("yast2-trans-en_GB")).toBe(true);
  });

  it("flags Nginx's own module-package convention, not the bare package or real standalone tools that merely mention nginx", () => {
    expect(looksLikeSupportPackage("nginx-mod-vts")).toBe(true);
    expect(looksLikeSupportPackage("nginx-mainline-mod-rtmp")).toBe(true);
    expect(looksLikeSupportPackage("nginx")).toBe(false);
    expect(looksLikeSupportPackage("nginx-config-formatter")).toBe(false);
  });

  it("flags Tesseract OCR's per-language/per-script trained-data convention, not the real tools sharing its prefix", () => {
    expect(looksLikeSupportPackage("tesseract-data-best-heb")).toBe(true);
    expect(looksLikeSupportPackage("tesseract-script-hangul")).toBe(true);
    expect(looksLikeSupportPackage("tesseract-osd")).toBe(true);
    expect(looksLikeSupportPackage("tesseract-langpack-chi_sim_vert")).toBe(true);
    expect(looksLikeSupportPackage("tesseract-ocr")).toBe(false);
    expect(looksLikeSupportPackage("tesseract-gui")).toBe(false);
    expect(looksLikeSupportPackage("tesseract-game")).toBe(false);
    expect(looksLikeSupportPackage("tesseract-matrix")).toBe(false);
  });

  it("flags fortune-mod's quote-collection data packages and StarDict's dictionary-data packages, not their real base tools", () => {
    expect(looksLikeSupportPackage("fortune-mod-kaamelott")).toBe(true);
    expect(looksLikeSupportPackage("stardict-freedict-eng-fra")).toBe(true);
    expect(looksLikeSupportPackage("stardict")).toBe(false);
  });

  it("flags Certbot's per-DNS-provider plugins, not the base client or its other real plugins", () => {
    expect(looksLikeSupportPackage("certbot-dns-gandi")).toBe(true);
    expect(looksLikeSupportPackage("certbot")).toBe(false);
    expect(looksLikeSupportPackage("certbot-dns")).toBe(false);
    expect(looksLikeSupportPackage("certbot-nginx-git")).toBe(false);
  });

  it("flags MATLAB's per-release GCC-version-pin meta-packages, not the base app or its real toolboxes", () => {
    expect(looksLikeSupportPackage("matlab-r2024a-gcc-fortran-meta")).toBe(true);
    expect(looksLikeSupportPackage("matlab-r2023b-gcc8-meta")).toBe(true);
    expect(looksLikeSupportPackage("matlab")).toBe(false);
    expect(looksLikeSupportPackage("matlab-dipimage")).toBe(false);
  });

  it("flags shell tab-completion scripts across every source, not the real shells sharing a similar name", () => {
    expect(looksLikeSupportPackage("docker-stable-fish-completion")).toBe(true);
    expect(looksLikeSupportPackage("kubens-bash-completion")).toBe(true);
    expect(looksLikeSupportPackage("mcphost-bash-completion")).toBe(true);
    expect(looksLikeSupportPackage("bash-git")).toBe(false);
    expect(looksLikeSupportPackage("fish-git")).toBe(false);
    expect(looksLikeSupportPackage("zsh-git")).toBe(false);
    expect(looksLikeSupportPackage("tcsh-git")).toBe(false);
  });

  it("flags Aspell/Ispell's per-language dictionary-data convention, not the real ispell program or aspell's own real AUR VCS-build variant", () => {
    expect(looksLikeSupportPackage("aspell-ky")).toBe(true);
    expect(looksLikeSupportPackage("ispell-brazilian")).toBe(true);
    expect(looksLikeSupportPackage("ispell")).toBe(false);
    expect(looksLikeSupportPackage("aspell-git")).toBe(false);
  });

  it("flags dict/dictd's per-dictionary data convention, not the real dictd client", () => {
    expect(looksLikeSupportPackage("dict-freedict-tur-deu")).toBe(true);
    expect(looksLikeSupportPackage("dict-gcide")).toBe(true);
    expect(looksLikeSupportPackage("dict")).toBe(false);
  });

  it("flags woff2-/xfonts-/hyphen- font and hyphenation data conventions", () => {
    expect(looksLikeSupportPackage("woff2-noto")).toBe(true);
    expect(looksLikeSupportPackage("xfonts-base")).toBe(true);
    expect(looksLikeSupportPackage("hyphen-de")).toBe(true);
  });

  it("flags TeX Live's texmf-dist-* distribution-bundle convention and GObject introspection typelib- binding metadata", () => {
    expect(looksLikeSupportPackage("texmf-dist-latex")).toBe(true);
    expect(looksLikeSupportPackage("typelib-1_0-ICal-3_0")).toBe(true);
  });

  it("flags LibreOffice's mythes- thesaurus-data convention and woff- font packages", () => {
    expect(looksLikeSupportPackage("mythes-gl")).toBe(true);
    expect(looksLikeSupportPackage("woff-fira-code")).toBe(true);
  });

  it("flags Adobe's own font/character-mapping-data packages, not the real apps/tools sharing the prefix", () => {
    expect(looksLikeSupportPackage("adobe-source-han-mono-hk-fonts")).toBe(true);
    expect(looksLikeSupportPackage("adobe-source-han-super-otc")).toBe(true);
    expect(looksLikeSupportPackage("adobe-mappings-cmap")).toBe(true);
    expect(looksLikeSupportPackage("adobe-dng-lcp")).toBe(true);
    expect(looksLikeSupportPackage("adobe-reader-11")).toBe(false);
    expect(looksLikeSupportPackage("Adobe-Connect-Linux")).toBe(false);
    expect(looksLikeSupportPackage("adobe-afdko")).toBe(false);
  });

  it("flags a generic font- prefix, not the small handful of real standalone tools sharing it", () => {
    expect(looksLikeSupportPackage("font-inter")).toBe(true);
    expect(looksLikeSupportPackage("font-iosevka")).toBe(true);
    expect(looksLikeSupportPackage("font-editor")).toBe(true);
    expect(looksLikeSupportPackage("font-validator")).toBe(true);
  });

  it("flags Ubuntu's own language-pack- leading-prefix translation convention", () => {
    expect(looksLikeSupportPackage("language-pack-gnome-de")).toBe(true);
    expect(looksLikeSupportPackage("language-pack-th-base")).toBe(true);
  });

  it("flags LibreOffice's autocorr- per-language autocorrection-rules convention", () => {
    expect(looksLikeSupportPackage("autocorr-de")).toBe(true);
    expect(looksLikeSupportPackage("autocorr-fr")).toBe(true);
  });
});

describe("looksLikeSourceSpecificNoise", () => {
  it("flags Debian-family -source packages (shipped source code) but not the same suffix elsewhere", () => {
    expect(looksLikeSourceSpecificNoise("deb-debian", "bbswitch-source")).toBe(true);
    expect(looksLikeSourceSpecificNoise("deb-ubuntu", "linux-source")).toBe(true);
    expect(looksLikeSourceSpecificNoise("deb-mint", "gcc-13-source")).toBe(true);
    // Same suffix, different real meaning on other sources — verified
    // live: AUR's teamtalk-client-source is a real build-variant of a
    // real app, Nixpkgs' obs-gradient-source is a real OBS Studio input
    // source plugin, neither is shipped source code.
    expect(looksLikeSourceSpecificNoise("pacman-aur", "teamtalk-client-source")).toBe(false);
    expect(looksLikeSourceSpecificNoise("nix-nixpkgs", "obs-gradient-source")).toBe(false);
  });

  it("flags Snapcraft gadget snaps (board support, not a launchable app) but not AUR/Nixpkgs' unrelated -gadget", () => {
    expect(looksLikeSourceSpecificNoise("snap-snapcraft", "bluefield-gadget")).toBe(true);
    expect(looksLikeSourceSpecificNoise("snap-snapcraft", "hikey-snappy-gadget")).toBe(true);
    // kubectl-gadget is a real Kubernetes troubleshooting CLI tool.
    expect(looksLikeSourceSpecificNoise("nix-nixpkgs", "kubectl-gadget")).toBe(false);
  });

  it("flags AUR's android-<arch>- cross-compiled libraries, not the broader android- prefix", () => {
    expect(looksLikeSourceSpecificNoise("pacman-aur", "android-x86-64-libvdpau")).toBe(true);
    expect(looksLikeSourceSpecificNoise("pacman-aur", "android-aarch64-ffmpeg")).toBe(true);
    // A blanket android- prefix was checked and rejected: real standalone
    // tools share it without an arch token (android-emulator,
    // android-apktool, android-file-transfer, ...).
    expect(looksLikeSourceSpecificNoise("pacman-aur", "android-emulator")).toBe(false);
    expect(looksLikeSourceSpecificNoise("pacman-aur", "android-apktool")).toBe(false);
  });
});

describe("looksLikeSupportSection", () => {
  it("flags Debian/Ubuntu's library/doc/debug sections", () => {
    expect(looksLikeSupportSection("libs")).toBe(true);
    expect(looksLikeSupportSection("libdevel")).toBe(true);
    expect(looksLikeSupportSection("oldlibs")).toBe(true);
    expect(looksLikeSupportSection("doc")).toBe(true);
    expect(looksLikeSupportSection("debug")).toBe(true);
    expect(looksLikeSupportSection("introspection")).toBe(true);
    expect(looksLikeSupportSection("gnu-r")).toBe(true);
  });

  it("does not flag language-ecosystem sections that mix in real standalone tools", () => {
    // Verified against real cache data (filter/rules.ts's header comment
    // on NOISE_SECTIONS) — these sections aren't purely libraries the way
    // libs/libdevel/doc/debug/introspection/gnu-r are.
    expect(looksLikeSupportSection("python")).toBe(false);
    expect(looksLikeSupportSection("perl")).toBe(false);
    expect(looksLikeSupportSection("golang")).toBe(false);
    expect(looksLikeSupportSection("devel")).toBe(false);
  });

  it("does not flag ordinary app/game sections", () => {
    expect(looksLikeSupportSection("games")).toBe(false);
    expect(looksLikeSupportSection("graphics")).toBe(false);
    expect(looksLikeSupportSection("web")).toBe(false);
  });

  it("flags nixpkgs language-ecosystem attribute-path prefixes, including version-numbered ones", () => {
    expect(looksLikeSupportSection("rPackages")).toBe(true);
    expect(looksLikeSupportSection("haskellPackages")).toBe(true);
    expect(looksLikeSupportSection("python313Packages")).toBe(true);
    expect(looksLikeSupportSection("perlPackages")).toBe(true);
    expect(looksLikeSupportSection("perl5Packages")).toBe(true);
    expect(looksLikeSupportSection("ocamlPackages_latest")).toBe(true);
    expect(looksLikeSupportSection("lua54Packages")).toBe(true);
    expect(looksLikeSupportSection("rubyPackages_3_3")).toBe(true);
    expect(looksLikeSupportSection("chickenPackages_5")).toBe(true);
    expect(looksLikeSupportSection("texlivePackages")).toBe(true);
    expect(looksLikeSupportSection("typstPackages")).toBe(true);
  });

  it("flags nixpkgs toolchain/library sets verified individually, unlike '*Packages' in general", () => {
    expect(looksLikeSupportSection("qt6Packages")).toBe(true);
    expect(looksLikeSupportSection("winePackages")).toBe(true);
    expect(looksLikeSupportSection("wine64Packages")).toBe(true);
    expect(looksLikeSupportSection("wineWoW64Packages")).toBe(true);
    expect(looksLikeSupportSection("godotPackages_4_3")).toBe(true);
    expect(looksLikeSupportSection("postgresql16Packages")).toBe(true);
  });

  it("flags any nixpkgs plugin/extension prefix for a host app — not independently launchable", () => {
    // A general suffix pattern, verified safe across ~10 different
    // host-app namespaces (fish, tmux, obs-studio, netbox, roundcube,
    // gimp, elasticsearch, grafana, ...) — every sample was a plugin.
    expect(looksLikeSupportSection("vimPlugins")).toBe(true);
    expect(looksLikeSupportSection("vscode-extensions")).toBe(true);
    expect(looksLikeSupportSection("gnomeExtensions")).toBe(true);
    expect(looksLikeSupportSection("fishPlugins")).toBe(true);
    expect(looksLikeSupportSection("obs-studio-plugins")).toBe(true);
    expect(looksLikeSupportSection("php83Extensions")).toBe(true);
  });

  it("flags nixpkgs non-application prefixes", () => {
    expect(looksLikeSupportSection("emacsPackages")).toBe(true);
    expect(looksLikeSupportSection("tree-sitter-grammars")).toBe(true);
    expect(looksLikeSupportSection("linuxKernel")).toBe(true);
    expect(looksLikeSupportSection("linuxPackages_xanmod_stable")).toBe(true);
    expect(looksLikeSupportSection("androidenv")).toBe(true);
    expect(looksLikeSupportSection("hyphenDicts")).toBe(true);
    expect(looksLikeSupportSection("terraform-providers")).toBe(true);
  });

  it("does not flag kdePackages or php*Packages — both mix real standalone apps with libraries, same trap as Debian's devel section", () => {
    expect(looksLikeSupportSection("kdePackages")).toBe(false);
    expect(looksLikeSupportSection("php83Packages")).toBe(false);
    expect(looksLikeSupportSection("phpPackages")).toBe(false);
  });

  it("flags openSUSE's library/doc/font/localization/metapackage groups", () => {
    expect(looksLikeSupportSection("System/Libraries")).toBe(true);
    expect(looksLikeSupportSection("Documentation/HTML")).toBe(true);
    expect(looksLikeSupportSection("Documentation/Other")).toBe(true);
    expect(looksLikeSupportSection("System/X11/Fonts")).toBe(true);
    expect(looksLikeSupportSection("System/Localization")).toBe(true);
    expect(looksLikeSupportSection("Metapackages")).toBe(true);
  });

  it("does not flag openSUSE's Development/* groups — same language-ecosystem trap as Debian's devel/python/perl/golang sections", () => {
    expect(looksLikeSupportSection("Development/Libraries/C and C++")).toBe(false);
    expect(looksLikeSupportSection("Development/Languages/Python")).toBe(false);
    expect(looksLikeSupportSection("Development/Languages/Other")).toBe(false);
    expect(looksLikeSupportSection("Development/Tools/Other")).toBe(false);
  });

  it("flags Slackware's l (libraries) and f (FAQs/docs) series", () => {
    expect(looksLikeSupportSection("l")).toBe(true);
    expect(looksLikeSupportSection("f")).toBe(true);
  });

  it("does not flag Slackware's other series — same mixed-real-apps trap as everywhere else", () => {
    expect(looksLikeSupportSection("d")).toBe(false);
    expect(looksLikeSupportSection("a")).toBe(false);
    expect(looksLikeSupportSection("n")).toBe(false);
    expect(looksLikeSupportSection("kde")).toBe(false);
    expect(looksLikeSupportSection("xfce")).toBe(false);
    expect(looksLikeSupportSection("y")).toBe(false);
  });

  it("flags Solus's debug/library/docs/theme/emul32 PartOf values", () => {
    expect(looksLikeSupportSection("debug")).toBe(true);
    expect(looksLikeSupportSection("programming.library")).toBe(true);
    expect(looksLikeSupportSection("desktop.library")).toBe(true);
    expect(looksLikeSupportSection("multimedia.library")).toBe(true);
    expect(looksLikeSupportSection("programming.docs")).toBe(true);
    expect(looksLikeSupportSection("desktop.theme")).toBe(true);
    expect(looksLikeSupportSection("emul32")).toBe(true);
  });

  it("does not flag Solus's other PartOf values — same mixed-real-tools trap, including programming.devel's un-suffixed tail", () => {
    expect(looksLikeSupportSection("programming.devel")).toBe(false);
    expect(looksLikeSupportSection("programming.python")).toBe(false);
    expect(looksLikeSupportSection("programming")).toBe(false);
    expect(looksLikeSupportSection("system.base")).toBe(false);
    expect(looksLikeSupportSection("desktop.kde")).toBe(false);
  });

  it("flags Gentoo's acct-group/acct-user/virtual categories", () => {
    expect(looksLikeSupportSection("acct-group")).toBe(true);
    expect(looksLikeSupportSection("acct-user")).toBe(true);
    expect(looksLikeSupportSection("virtual")).toBe(true);
  });

  it("does not flag Gentoo's other categories", () => {
    expect(looksLikeSupportSection("games-strategy")).toBe(false);
    expect(looksLikeSupportSection("dev-libs")).toBe(false);
  });

  it("does not flag an absent section", () => {
    expect(looksLikeSupportSection(undefined)).toBe(false);
  });
});

describe("looksLikeGuiPackage", () => {
  it("flags real apps in a verified GUI-predictive section", () => {
    expect(looksLikeGuiPackage("abiword", "editors")).toBe(true);
    expect(looksLikeGuiPackage("obs-studio", "video")).toBe(true);
    expect(looksLikeGuiPackage("0ad", "games")).toBe(true);
    expect(looksLikeGuiPackage("wsjtx", "hamradio")).toBe(true);
  });

  it("does not flag sections with real theme/plugin contamination, despite a comparably high raw rate", () => {
    // x11/gnome/kde/xfce were checked and rejected — see rules.ts's
    // GUI_SECTIONS comment for the real theme/icon packages that ride
    // along in these sections (adwaita-icon-theme, breeze-icon-theme, ...).
    expect(looksLikeGuiPackage("some-window-manager", "x11")).toBe(false);
    expect(looksLikeGuiPackage("adwaita-icon-theme", "gnome")).toBe(false);
    expect(looksLikeGuiPackage("breeze-icon-theme", "kde")).toBe(false);
    expect(looksLikeGuiPackage("thunar", "xfce")).toBe(false);
  });

  it("does not flag sections at or below the GUI-rate baseline", () => {
    expect(looksLikeGuiPackage("some-tool", "utils")).toBe(false);
    expect(looksLikeGuiPackage("some-tool", "admin")).toBe(false);
    expect(looksLikeGuiPackage("some-tool", "web")).toBe(false);
    expect(looksLikeGuiPackage("some-tool", "mail")).toBe(false);
  });

  it("does not flag companion data/common/plugin/server/icon packages riding along in a GUI section", () => {
    expect(looksLikeGuiPackage("0ad-data", "games")).toBe(false);
    expect(looksLikeGuiPackage("abiword-common", "editors")).toBe(false);
    expect(looksLikeGuiPackage("ardour-lv2-plugins", "sound")).toBe(false);
    expect(looksLikeGuiPackage("bzflag-server", "games")).toBe(false);
    expect(looksLikeGuiPackage("qtel-icons", "hamradio")).toBe(false);
  });

  it("does not flag names that already look like a support package (-dev/-doc/lib*/...)", () => {
    expect(looksLikeGuiPackage("libreoffice-dev", "editors")).toBe(false);
    expect(looksLikeGuiPackage("libsdl2", "games")).toBe(false);
  });

  it("does not flag an absent section", () => {
    expect(looksLikeGuiPackage("0ad", undefined)).toBe(false);
  });
});

describe("looksLikeGamePackage", () => {
  it("flags Debian's games section, bare and component-prefixed", () => {
    expect(looksLikeGamePackage("deb-debian", "games")).toBe(true);
    expect(looksLikeGamePackage("deb-debian", "contrib/games")).toBe(true);
    expect(looksLikeGamePackage("deb-debian", "non-free/games")).toBe(true);
  });

  it("flags Ubuntu's games section (bare, since normalize.ts strips the component prefix)", () => {
    expect(looksLikeGamePackage("deb-ubuntu", "games")).toBe(true);
  });

  it("flags Mint/Pop!_OS/Deepin/MX Linux reusing Debian's unstripped vocabulary", () => {
    expect(looksLikeGamePackage("deb-mint", "games")).toBe(true);
    expect(looksLikeGamePackage("deb-popos", "games")).toBe(true);
    expect(looksLikeGamePackage("deb-deepin", "games")).toBe(true);
    expect(looksLikeGamePackage("deb-mxlinux", "games")).toBe(true);
  });

  it("flags Gentoo's games-* category prefix", () => {
    expect(looksLikeGamePackage("ebuild-gentoo", "games-strategy")).toBe(true);
    expect(looksLikeGamePackage("ebuild-gentoo", "games-fps")).toBe(true);
    expect(looksLikeGamePackage("ebuild-gentoo", "dev-libs")).toBe(false);
  });

  it("flags openSUSE's Amusements/Games group prefix", () => {
    expect(looksLikeGamePackage("rpm-opensuse", "Amusements/Games/Strategy/Real Time")).toBe(true);
    expect(looksLikeGamePackage("rpm-opensuse", "Amusements/Graphics")).toBe(false);
  });

  it("flags RPM Fusion's identical Amusements/Games group prefix", () => {
    expect(looksLikeGamePackage("rpm-rpmfusion", "Amusements/Games")).toBe(true);
    expect(looksLikeGamePackage("rpm-rpmfusion", "Applications/Multimedia")).toBe(false);
  });

  it("flags Solus's games/games.* PartOf value", () => {
    expect(looksLikeGamePackage("eopkg-solus", "games")).toBe(true);
    expect(looksLikeGamePackage("eopkg-solus", "games.strategy")).toBe(true);
    expect(looksLikeGamePackage("eopkg-solus", "programming.library")).toBe(false);
  });

  it("does not apply any distro's games vocabulary to a source it doesn't belong to", () => {
    expect(looksLikeGamePackage("rpm-fedora", "games")).toBe(false);
    expect(looksLikeGamePackage("pacman-aur", "games-strategy")).toBe(false);
  });

  it("does not flag an absent section", () => {
    expect(looksLikeGamePackage("deb-debian", undefined)).toBe(false);
  });
});
