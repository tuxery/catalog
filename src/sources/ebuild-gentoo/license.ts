import { GENTOO_TO_SPDX } from "./license-table";

const SPDX_BY_LOWERCASE = new Map(
  Object.entries(GENTOO_TO_SPDX).map(([gentoo, spdx]) => [gentoo.toLowerCase(), spdx]),
);

type Node = string | { anyOf: Node[] } | { allOf: Node[] };

/** Reads one `( ... )`-free run of tokens, up to the closing `)` of the group the caller opened. */
function parseGroup(tokens: string[], at: { i: number }): Node[] {
  const nodes: Node[] = [];
  while (at.i < tokens.length) {
    const token = tokens[at.i++] as string;
    if (token === ")") return nodes;
    if (token === "(") {
      nodes.push({ allOf: parseGroup(tokens, at) });
    } else if (token === "||" && tokens[at.i] === "(") {
      at.i++;
      nodes.push({ anyOf: parseGroup(tokens, at) });
    } else if (token.endsWith("?") && tokens[at.i] === "(") {
      // A `flag? ( ... )` group only applies to a build with that USE flag:
      // not a license of the package as such, so it is left out.
      at.i++;
      parseGroup(tokens, at);
    } else {
      nodes.push(token);
    }
  }
  return nodes;
}

function render(node: Node, nested: boolean): string | undefined {
  if (typeof node === "string") return SPDX_BY_LOWERCASE.get(node.toLowerCase()) ?? node;
  const isAny = "anyOf" in node;
  const parts = (isAny ? node.anyOf : node.allOf)
    .map((child) => render(child, true))
    .filter((part): part is string => part !== undefined);
  if (parts.length === 0) return undefined;
  const joined = parts.join(isAny ? " OR " : " AND ");
  return nested && parts.length > 1 ? `(${joined})` : joined;
}

/**
 * An ebuild's `LICENSE` (`GPL-2 || ( LGPL-2.1 MPL-1.1 )`) as an SPDX
 * expression: names in Gentoo's own table become their SPDX id, the rest
 * (`vim`, `freedist`) stay as Gentoo names; space-separated terms all
 * apply (AND), `|| ( )` is a choice (OR), USE-conditional groups are
 * dropped. `undefined` when nothing is left. Pure.
 */
export function gentooLicenseToSpdx(license: string | undefined): string | undefined {
  if (!license) return undefined;
  const tokens = license
    .replace(/([()])/g, " $1 ")
    .split(/\s+/)
    .filter(Boolean);
  const root = parseGroup(tokens, { i: 0 });
  return root.length === 1 ? render(root[0] as Node, false) : render({ allOf: root }, false);
}
