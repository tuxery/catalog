import type { Risk } from "../types";

// Trailing name tokens AUR's submission guidelines (and Gentoo's own
// practice) reserve for an alternate build of the same software — see
// docs/product-families.md. Read right to left, so `-nightly-bin` is a
// nightly risk built as a repackaged binary, and reading stops at the
// first token that isn't one of these (`firefox-nightly-de-bin` keeps
// only `bin`: `de` isn't a build token).
const VCS_TOKENS = new Set(["git", "svn", "hg", "bzr", "cvs"]);
const FLAVOR_TOKENS = new Set(["bin", "appimage"]);
// `-dev` is deliberately not a risk word: it collides with Debian-style
// development-header packages (see match/group.ts's CHANNEL_WORD_SUFFIX).
const RISK_WORDS: Record<string, Risk> = {
  beta: "beta",
  alpha: "beta",
  preview: "beta",
  nightly: "nightly",
  canary: "nightly",
  unstable: "nightly",
};

export interface NameAxes {
  risk?: Risk;
  flavors?: string[];
}

/**
 * The risk and flavors a package's own name declares through its
 * trailing build tokens — `undefined` fields when it declares none. A
 * VCS token wins over a risk word (`-beta-git` is built from a branch
 * head, `git`). Pure — no I/O.
 */
export function nameAxes(name: string): NameAxes {
  const tokens = name.split("-");
  let risk: Risk | undefined;
  const flavors: string[] = [];

  for (let index = tokens.length - 1; index > 0; index--) {
    const token = tokens[index] ?? "";
    if (VCS_TOKENS.has(token)) risk = "git";
    else if (FLAVOR_TOKENS.has(token)) flavors.unshift(token);
    else if (RISK_WORDS[token]) risk ??= RISK_WORDS[token];
    else break;
  }

  return {
    ...(risk ? { risk } : {}),
    ...(flavors.length > 0 ? { flavors } : {}),
  };
}
