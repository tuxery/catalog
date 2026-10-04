/**
 * Compares two Debian package versions (`[epoch:]upstream[-revision]`) the
 * way dpkg does, for picking the newest stanza when a Packages index lists
 * several versions of one package (vendor repos keep their history).
 * `helpers4/version` only knows semver and Gentoo; the Debian rules differ
 * on exactly the cases that matter here: `~` sorts before everything, even
 * the end of the string ("8.30.0~beta.1" < "8.30.0"), and a missing epoch
 * is 0. Returns a negative number, 0 or a positive number, like `compare`.
 */
export function compareDebVersions(a: string, b: string): number {
  const [epochA, restA] = splitEpoch(a);
  const [epochB, restB] = splitEpoch(b);
  if (epochA !== epochB) return epochA - epochB;

  const [upstreamA, revisionA] = splitRevision(restA);
  const [upstreamB, revisionB] = splitRevision(restB);
  return compareFragment(upstreamA, upstreamB) || compareFragment(revisionA, revisionB);
}

function splitEpoch(version: string): [number, string] {
  const match = /^(\d+):(.*)$/.exec(version);
  return match ? [Number(match[1]), match[2] ?? ""] : [0, version];
}

function splitRevision(version: string): [string, string] {
  const index = version.lastIndexOf("-");
  return index === -1 ? [version, ""] : [version.slice(0, index), version.slice(index + 1)];
}

/** Sort weight of one non-digit character: `~` first, then end of string, then letters, then everything else. */
function weight(char: string | undefined): number {
  if (char === undefined) return 0;
  if (char === "~") return -1;
  return /[A-Za-z]/.test(char) ? char.charCodeAt(0) : char.charCodeAt(0) + 256;
}

function compareFragment(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    // Non-digit run, character by character.
    while ((i < a.length && !isDigit(a[i])) || (j < b.length && !isDigit(b[j]))) {
      const difference =
        weight(isDigit(a[i]) ? undefined : a[i]) - weight(isDigit(b[j]) ? undefined : b[j]);
      if (difference !== 0) return difference;
      if (i < a.length && !isDigit(a[i])) i += 1;
      if (j < b.length && !isDigit(b[j])) j += 1;
    }
    // Digit run, numerically.
    let numberA = "";
    while (i < a.length && isDigit(a[i])) numberA += a[i++];
    let numberB = "";
    while (j < b.length && isDigit(b[j])) numberB += b[j++];
    const difference = Number(numberA || "0") - Number(numberB || "0");
    if (difference !== 0) return difference;
  }
  return 0;
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}
