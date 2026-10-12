import { describe, expect, it } from "vitest";
import { parsePopcon } from "./popcon";

// Real lines of popcon.debian.org/all-popcon-results.txt.gz, 2026-10-12.
const SAMPLE = `Submissions:   292000
Release: 1.28                               1
Architecture: amd64                    250000
Package: 0ad                              163  1194    87     0
Package: firefox-esr                    55390 31815 36859     4
Package: vlc                              155  1380    39 43180
`;

describe("parsePopcon", () => {
  it("sums vote, old, recent and no-files into the install count", () => {
    expect(parsePopcon(SAMPLE)).toEqual(
      new Map([
        ["0ad", 163 + 1194 + 87],
        ["firefox-esr", 55390 + 31815 + 36859 + 4],
        ["vlc", 155 + 1380 + 39 + 43180],
      ]),
    );
  });

  it("skips anything that isn't a package line", () => {
    expect(parsePopcon("Submissions: 1\n").size).toBe(0);
  });
});
