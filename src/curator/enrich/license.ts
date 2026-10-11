import { createRequire } from "node:module";
import parseSpdx from "spdx-expression-parse";

// The SPDX license list, as data (CC0): current ids, and the deprecated ones
// sources still write ("GPL-3.0", "GPL-2.0+").
const require = createRequire(import.meta.url);
const SPDX_IDS = require("spdx-license-ids") as string[];
const DEPRECATED_IDS = require("spdx-license-ids/deprecated.json") as string[];

// Case-insensitive lookup → the id's canonical spelling.
const CANONICAL_ID = new Map(
  [...SPDX_IDS, ...DEPRECATED_IDS].map((id) => [id.toLowerCase(), id] as const),
);

// GNU licenses lost their bare ids in SPDX 3.0: "GPL-3.0" became
// "GPL-3.0-only", "GPL-3.0+" "GPL-3.0-or-later". The mapping is SPDX's own,
// so upgrading them adds no information that wasn't there.
const GNU_DEPRECATED = /^(A?GPL|LGPL|GFDL)-(\d\.\d)(\+?)$/;

// Shorthands that name exactly one SPDX license, version included. Never
// "GPL3" or "LGPL2.1": GNU licenses come as -only and -or-later, and the
// shorthand doesn't say which. Never a bare "GPL", "BSD" or "Apache".
const ALIASES = new Map<string, string>([
  ["apache 2.0", "Apache-2.0"],
  ["apache-2", "Apache-2.0"],
  ["apache2", "Apache-2.0"],
  ["apache2.0", "Apache-2.0"],
  ["apache license 2.0", "Apache-2.0"],
  ["apache license, version 2.0", "Apache-2.0"],
  ["mpl2", "MPL-2.0"],
  ["mpl-2", "MPL-2.0"],
  ["mpl 2.0", "MPL-2.0"],
  ["bsd3", "BSD-3-Clause"],
  ["bsd-3", "BSD-3-Clause"],
  ["bsd 3-clause", "BSD-3-Clause"],
  ["3-clause bsd", "BSD-3-Clause"],
  ["bsd2", "BSD-2-Clause"],
  ["bsd-2", "BSD-2-Clause"],
  ["bsd 2-clause", "BSD-2-Clause"],
  ["2-clause bsd", "BSD-2-Clause"],
  ["expat", "MIT"],
  ["boost", "BSL-1.0"],
]);

// SPDX's escape hatch for a license outside the list ("LicenseRef-proprietary"):
// valid as written, and it claims nothing more.
const LICENSE_REF = /^LicenseRef-[A-Za-z0-9.-]+$/;

function spdxId(term: string): string | undefined {
  if (LICENSE_REF.test(term)) return term;
  // Arch's "custom:MIT" is the MIT text under a name Arch doesn't list.
  const name = term.replace(/^custom:\s*/i, "").trim();
  // "GPL-2.0+", "MPL-1.1+": SPDX's "or any later version" operator.
  const plus = name.endsWith("+");
  const bare = (plus ? name.slice(0, -1) : name).toLowerCase();
  const id = CANONICAL_ID.get(bare) ?? ALIASES.get(bare);
  if (!id) return undefined;
  const gnu = GNU_DEPRECATED.exec(`${id}${plus ? "+" : ""}`);
  if (gnu) return `${gnu[1]}-${gnu[2]}-${gnu[3] ? "or-later" : "only"}`;
  return plus ? `${id}+` : id;
}

/**
 * A raw license string as an SPDX expression, when every license in it maps
 * to exactly one SPDX id: valid ids in any case, SPDX's own upgrades of
 * deprecated GNU ids, and a few unambiguous shorthands (`Apache 2.0`,
 * `BSD3`, `MPL2`, `Expat`). `undefined` as soon as one term can't be mapped
 * without guessing — "GPL3" doesn't say -only or -or-later, "BSD" doesn't
 * say how many clauses, "custom" says nothing — so the raw string stays the
 * only claim. Unlike `spdx-correct`, which turns "GPL" into
 * "GPL-3.0-or-later" and "Apache AND MIT" into "Apache-2.0".
 */
export function toSpdxExpression(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const tokens = raw.trim().split(/(\s+(?:AND|OR|WITH)\s+|[()])/i);
  let afterWith = false;
  const mapped: string[] = [];
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    if (/^(AND|OR|WITH)$/i.test(trimmed)) {
      mapped.push(` ${trimmed.toUpperCase()} `);
      afterWith = /^WITH$/i.test(trimmed);
      continue;
    }
    if (trimmed === "(" || trimmed === ")") {
      mapped.push(trimmed);
      continue;
    }
    if (afterWith) {
      // An exception id ("GCC-exception-3.1"): `parseSpdx` checks it below.
      mapped.push(trimmed);
      afterWith = false;
      continue;
    }
    const id = spdxId(trimmed);
    if (!id) return undefined;
    mapped.push(id);
  }
  const expression = mapped.join("");
  try {
    parseSpdx(expression);
    return expression;
  } catch {
    return undefined;
  }
}

/** Whether a license makes an app free software — `unknown` is never shown as a verdict. */
export type LicenseKind = "free" | "proprietary" | "unknown";

// Families of licenses the FSF or the OSI approve, as spelled across
// sources (SPDX ids, Arch and Debian shorthands). Matched at the start of
// one normalized term, so "GPL", "GPLv3", "GPL-3.0-or-later" and "GPL2+"
// all fall under GPL. Creative Commons only without NC/ND.
const FREE_TERM =
  /^(MIT|X11|ISC|ZLIB|UNLICENSE|0BSD|BSD|APACHE|AGPL|LGPL|GPL|MPL|EPL|CDDL|ARTISTIC|PSF|PYTHON|OFL|CC0|CC-BY(?!-(NC|ND))|CC-BY-SA|WTFPL|BSL-1|BOOST|RUBY|PHP|VIM|AFL|EUPL|OSL|MS-PL|NCSA|PERL|PUBLIC ?DOMAIN|LPPL|LIBPNG|CURL|UNICODE|BLUEOAK|MIROS|FTL|IJG|OPENSSL|SLEEPYCAT|W3C|ZPL|MULANPSL|GFDL|FDL|POSTGRESQL|BZIP2)/;

// Words that say a term is proprietary on its own ("End User ... License
// Agreement" is an EULA spelled out).
const PROPRIETARY_TERM =
  /\b(PROPRIETARY|EULA|END[- ]USER|COMMERCIAL|FREEWARE|SHAREWARE|NON-?FREE|ALL RIGHTS RESERVED)\b/;

function classifyTerm(term: string): LicenseKind {
  // Arch's "custom:<name>" names a license it doesn't otherwise know —
  // free or not depending on the name ("custom:BSD-2-clause" vs
  // "custom:Brother EULA").
  const name = term
    .replace(/^custom:\s*/i, "")
    .replace(/^LicenseRef-/i, "")
    .trim()
    .toUpperCase();
  if (PROPRIETARY_TERM.test(name)) return "proprietary";
  if (FREE_TERM.test(name)) return "free";
  return "unknown";
}

/**
 * Whether a raw license string makes the app free software, across the
 * 2,500+ spellings sources use. Free only when every part is a recognized
 * free license; proprietary when a part says so explicitly (unless an OR
 * offers a free choice); anything else ("custom", "unknown", BUSL,
 * non-commercial Creative Commons) is `unknown`. Moved from `app`'s
 * `src/license.ts`, so the catalog can store it and `/browse` filter on it.
 */
export function classifyLicense(license: string | undefined): LicenseKind {
  if (!license?.trim()) return "unknown";
  const terms = license
    .split(/\s+(?:AND|OR)\s+|[,;()]|\s+\/\s+/i)
    // "GPL-3.0-or-later WITH GCC-exception-3.1": an exception only adds
    // permissions, it doesn't change the license it applies to.
    .map((term) => term.split(/\s+WITH\s+/i)[0] ?? "")
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) return "unknown";

  const kinds = terms.map(classifyTerm);
  if (kinds.includes("proprietary")) {
    // "MIT OR proprietary" is a choice that includes a free one.
    return /\sOR\s/i.test(license) && kinds.includes("free") ? "unknown" : "proprietary";
  }
  return kinds.every((kind) => kind === "free") ? "free" : "unknown";
}
