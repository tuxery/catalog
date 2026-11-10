import { readFileSync } from "node:fs";

/**
 * One source's record in `config/source-terms.json`: what its terms allow,
 * as we read them, with the evidence. Published with the dataset (the
 * `sourceTerms` meta row) so `app` can render one page per source from it
 * instead of a hand-kept copy.
 */
export interface SourceTermsRecord {
  verdict: string;
  automatedFetch: string;
  publicStorage: string;
  attribution: string | null;
  fieldLicense: string;
  evidence: { url: string; read: boolean; finding: string }[];
  note?: string;
  action?: string;
}

export interface SourceTerms {
  checkedOn: string;
  disclaimer: string;
  sources: Record<string, SourceTermsRecord>;
}

const SOURCE_TERMS_PATH = new URL("../../config/source-terms.json", import.meta.url);

/** `config/source-terms.json`, or `undefined` when it can't be read (the dataset then publishes without it). */
export function readSourceTerms(path: URL = SOURCE_TERMS_PATH): SourceTerms | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SourceTerms;
  } catch {
    return undefined;
  }
}
