import type { FormalSignals } from "../types";

// A bare package name, as every format writes one: Arch/AUR, Debian and
// RPM all allow letters, digits and `.+-_`, RPM and nixpkgs `@` too.
// Anything else — RPM's synthetic capabilities (`libc.so.6()(64bit)`,
// `pkgconfig(gtk+-3.0)`, `perl(Foo::Bar)`, `application(...)`, the
// arch-qualified self-provide `firefox(x86-64)`), file paths
// (`/usr/bin/sh`), AUR's free-text entries — isn't a package another
// row could be named after, so it's dropped.
const PLAIN_NAME = /^[\w.+@-]+$/;

/**
 * Reduces one declared relation to the package name it points at:
 * version constraints (`python>=3.8`, `libc6 (>= 2.34)`) and Debian
 * architecture qualifiers (`python3:any`) stripped. `undefined` when
 * what's left isn't a plain package name. Pure — no I/O.
 */
export function relationName(value: string): string | undefined {
  const name = value
    .trim()
    .split(/[\s<>=]/)[0]
    ?.replace(/:[a-z\d-]+$/, "");
  return name && PLAIN_NAME.test(name) ? name : undefined;
}

/**
 * Every package name a list of declared relations points at — see
 * `relationName` — deduplicated, in first-seen order, without `self`
 * (packages commonly provide or conflict with their own name). Pure.
 */
export function relationNames(
  values: readonly string[] | null | undefined,
  self: string,
): string[] | undefined {
  const names = new Set<string>();
  for (const value of values ?? []) {
    const name = relationName(value);
    if (name && name !== self) names.add(name);
  }
  return names.size > 0 ? [...names] : undefined;
}

/**
 * Splits a Debian relationship field (`Depends`, `Provides`, `Enhances`,
 * ...) — comma-separated, `|` between alternatives — into package names.
 * Alternatives are flattened: `a | b` declares a relation to both, and
 * the curator only ever asks "does this package point at X". Pure.
 */
export function debRelationNames(field: string | undefined, self: string): string[] | undefined {
  return relationNames(field?.split(/[,|]/), self);
}

/**
 * An RPM's source package name, from its `sourcerpm` filename
 * (`firefox-128.0-1.fc41.src.rpm` -> `firefox`): RPM filenames are
 * `<name>-<version>-<release>.src.rpm`, and neither version nor release
 * may contain a `-`, so the last two dash-separated fields are dropped.
 * Pure.
 */
export function sourceRpmName(sourcerpm: string | undefined): string | undefined {
  return sourcerpm?.match(/^(.+)-[^-]+-[^-]+\.src\.rpm$/)?.[1];
}

/**
 * Drops every empty field of a `FormalSignals`, and `base` when it's just
 * the package's own name — `undefined` when nothing is left, so a cache
 * row without any declared relation carries no `formal` key at all. Pure.
 */
export function compactFormal(name: string, signals: FormalSignals): FormalSignals | undefined {
  const compacted: FormalSignals = {};
  for (const [key, value] of Object.entries(signals) as [keyof FormalSignals, unknown][]) {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      continue;
    }
    if (key === "base" && value === name) continue;
    Object.assign(compacted, { [key]: value });
  }
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}
