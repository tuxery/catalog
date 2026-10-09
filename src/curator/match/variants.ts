import type { Risk } from "../../sources";

// What `<project>-<rest>` means when a package names itself after another
// project (docs/product-families.md). Measured on the real AUR/Arch caches
// (2026-10-08) over the 3,223 packages that declare `provides=X` and
// `conflicts=X` with a name `X-<rest>`: the rest is mostly a build option
// or patch set (`cuda`, `wayland`, `qt5`, `nox`, `vaapi`), but a few words
// mark a different project or a shim instead — those never fold.
const NON_VARIANT_TOKENS = new Set([
  // A fork or successor under a new name: goldendict-ng, aichat-ng, *-next, *-fork.
  "ng",
  "next",
  "fork",
  "reborn",
  "classic",
  // A rewrite in another language is another project: chipmunk-rs (a log
  // viewer) declares provides/conflicts on chipmunk (a physics library),
  // dmenu-rs, hr-zig.
  "rs",
  "rust",
  "go",
  "zig",
  // A shim around the project, not a build of it:
  // firefox-developer-edition-firefox-symlink provides/conflicts firefox.
  "symlink",
  "symlinks",
  // Language packs are companions, not builds: firefox-esr-i18n-fr.
  "i18n",
  "l10n",
]);

const TRACK_TOKENS = new Set(["esr", "lts", "legacy"]);
// A version line kept as its own package: k3s-1.31-bin, blender-2.83-git,
// asterisk-lts-22 (track `lts-22`).
const VERSION_TOKEN = /^\d+(?:\.\d+)*$/;

const RISK_TOKENS: Record<string, Risk | null> = {
  beta: "beta",
  alpha: "beta",
  preview: "beta",
  nightly: "nightly",
  canary: "nightly",
  unstable: "nightly",
  edge: "nightly",
  rc: "candidate",
  pre: "candidate",
  snapshot: "nightly",
  daily: "nightly",
  dev: "git",
  devel: "git",
  develop: "git",
  insiders: "nightly",
  experimental: "beta",
  // Explicitly the default line: no risk, and not a flavor either.
  stable: null,
};

// Language (and Chinese region) codes seen in full builds' names:
// firefox-nightly-de-bin, firefox-esr-zh-bin. Deliberately not every ISO
// 639-1 code — `no`, `go`, `is`, `be`, `an` mostly mean something else in
// a package name (`aerc-no-notmuch`).
const LOCALE_TOKENS = new Set(
  "ar bg ca cn cs da de el es et fa fi fr he hi hr hu id it ja ko lt lv nl pl pt ro ru sk sl sr sv th tr tw uk vi zh".split(
    " ",
  ),
);

/** Whether every token is one of the language codes builds are named with (`de`, `zh-tw`). Pure. */
export function isLocaleRest(rest: readonly string[]): boolean {
  return rest.length > 0 && rest.every((token) => LOCALE_TOKENS.has(token));
}

/** Whether `rest` (the tokens after `<project>-`) describes a build of that project rather than another project or a companion. Pure. */
export function isVariantRest(rest: readonly string[]): boolean {
  return rest.length > 0 && rest.every((token) => !NON_VARIANT_TOKENS.has(token));
}

export interface RestAxes {
  track?: string;
  risk?: Risk;
  flavors?: string[];
}

/**
 * Reads the axes `rest` declares: track words and version numbers (joined,
 * `lts-22`), a risk word, locale codes
 * (`locale:de`), and whatever is left joined back as one flavor
 * (`smooth-cursor`, `no-notmuch`). Pure.
 */
export function axesFromRest(rest: readonly string[]): RestAxes {
  const trackParts: string[] = [];
  let risk: Risk | undefined;
  const flavors: string[] = [];
  const other: string[] = [];

  for (const token of rest) {
    if (TRACK_TOKENS.has(token) || VERSION_TOKEN.test(token)) trackParts.push(token);
    else if (token in RISK_TOKENS) risk ??= RISK_TOKENS[token] ?? undefined;
    else if (LOCALE_TOKENS.has(token)) flavors.push(`locale:${token}`);
    else other.push(token);
  }
  if (other.length > 0) flavors.unshift(other.join("-"));
  const track = trackParts.length > 0 ? trackParts.join("-") : undefined;

  return {
    ...(track ? { track } : {}),
    ...(risk ? { risk } : {}),
    ...(flavors.length > 0 ? { flavors } : {}),
  };
}

/** The tokens after `<base>-` in `name`, or `undefined` when `name` isn't `<base>-<something>`. Pure. */
export function restAfter(name: string, base: string): string[] | undefined {
  return name.startsWith(`${base}-`) ? name.slice(base.length + 1).split("-") : undefined;
}

// Words too common in package descriptions to tie two packages together.
const STOP_WORDS = new Set(
  "with from that this your into based more than only also which their have will when what program application tool package version support".split(
    " ",
  ),
);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z\d]+/)
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word)),
  );
}

/**
 * Whether two descriptions share a significant word — two builds of one
 * project describe themselves alike. Words in `ignore` (the project's own
 * name) don't count: every `linux-*` package mentions Linux. Pure.
 */
export function describedAlike(a: string, b: string, ignore: readonly string[] = []): boolean {
  const theirs = significantWords(b);
  return [...significantWords(a)].some((word) => theirs.has(word) && !ignore.includes(word));
}

/**
 * Whether a drop-in build's description is plausibly about `target`: it
 * names the target, or shares one significant word with the target's own
 * description. Measured 2026-10-08 on the AUR/Arch drop-ins: 3,048 of
 * 3,223 pass; the 175 that don't are almost all unrelated software whose
 * files merely collide (`ack-cpm`, a C compiler, vs `ack`, a grep tool;
 * `hydra-download-manager` vs `hydra`). Pure.
 */
export function describesTarget(
  description: string,
  target: string,
  targetDescription: string,
): boolean {
  if (description.toLowerCase().includes(target.toLowerCase())) return true;
  return describedAlike(description, targetDescription);
}

/** Whether every token names a track or a risk — nothing else (no flavor). Pure. */
export function onlyTrackOrRisk(rest: readonly string[]): boolean {
  return (
    rest.length > 0 &&
    rest.every(
      (token) => TRACK_TOKENS.has(token) || VERSION_TOKEN.test(token) || token in RISK_TOKENS,
    )
  );
}

/**
 * The tokens a Snap name or Flatpak id adds to another one of the same
 * group — `discord-canary` over `discord`, `com.discordapp.DiscordCanary`
 * over `com.discordapp.Discord` (a CamelCase boundary counts),
 * `com.vscodium.codium-insiders` over `com.vscodium.codium` —
 * lowercased. `undefined` when `id` doesn't extend `base`. Pure.
 */
export function storeIdRest(id: string, base: string): string[] | undefined {
  if (id.length <= base.length || !id.startsWith(base)) return undefined;
  const rest = id.slice(base.length);
  const separated = /^[-_.]/.test(rest);
  const camelCase = /[a-z\d]$/.test(base) && /^[A-Z]/.test(rest);
  if (!separated && !camelCase) return undefined;
  return rest
    .replace(/^[-_.]/, "")
    .replaceAll(/([a-z\d])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .split(/[-_.]/)
    .filter(Boolean);
}
