import { fromSeconds } from "helpers4/date";

/** An epoch in seconds (a number or its decimal text) as an ISO date, `undefined` for a missing, zero or non-numeric one. */
export function epochSecondsToIso(seconds: number | string | undefined): string | undefined {
  const epoch = Number(seconds);
  return Number.isFinite(epoch) && epoch > 0 ? fromSeconds(epoch)?.toISOString() : undefined;
}

/** A positive whole number from a number or its decimal text, `undefined` otherwise. */
export function positiveInt(value: number | string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
