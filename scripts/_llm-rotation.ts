import type { LlmModel } from "../src/curator/enrich/llm-models";
import { callModel, ModelUnavailable, RetryLater, type Prompt } from "./_llm-providers";

/**
 * Model rotation over config/llm-models.json's free tiers, shared by every
 * LLM script (`classify-llm`, `triage-llm`): per-model pacing (requests and
 * tokens per minute), in-place retries on per-minute limits and overloads,
 * and per-model availability — a daily cap rests the model until its
 * provider's reset (Groq's rolling window is often back within minutes),
 * an overload rests it with a growing backoff. Failed requests can count
 * against a daily quota (observed on Gemini), so an overloaded model is
 * probed at most MAX_OVERLOAD_STREAK times in a row before it's dropped for
 * the run — bounding the quota a long outage burns.
 */

/**
 * Thrown when this run should stop for now — every model's daily quota
 * spent, the `maxRequests` cap, or every model staying overloaded through
 * several rounds. The caller persists progress and exits cleanly:
 * re-running later resumes where this one left off.
 */
export class StopRun extends Error {}

export interface ModelStats {
  requests: number;
  /** Items (apps, suspects, ...) that got a result — counted by the caller, see `Rotation.countItems`. */
  items: number;
  tokens: number;
}

export interface Rotation {
  /**
   * Runs the next batch of `items` from `cursor` on the highest-priority
   * model available right now (config/llm-models.json order, so a
   * recovered Gemini model takes over again from Groq). The batch is sliced
   * only once the model is picked, since batch size is per model. When none
   * is available, waits for the next one if it's back within
   * `maxIdleMinutes`, else throws `StopRun`, saying when to re-run.
   */
  next<I, T>(
    items: readonly I[],
    cursor: number,
    prompt: (batch: I[]) => Prompt<T>,
    /** Items per request for this model — its `batchSize` by default (sized for one app per item). */
    sizeOf?: (model: LlmModel) => number,
  ): Promise<{ batch: I[]; results: T[]; model: LlmModel }>;
  /** Books `count` items as answered by `model`, for `stats`. */
  countItems(model: LlmModel, count: number): void;
  stats(): ReadonlyMap<string, ModelStats>;
  requestsMade(): number;
}

interface Availability {
  availableAt: number;
  overloadStreak: number;
  dropped: boolean;
}

const MAX_OVERLOAD_STREAK = 5;
const OVERLOAD_BACKOFF_MS = 2 * 60_000;
const OVERLOAD_BACKOFF_CAP_MS = 30 * 60_000;

function clock(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function createRotation(
  models: readonly LlmModel[],
  { maxRequests, maxIdleMinutes }: { maxRequests?: number; maxIdleMinutes: number },
): Rotation {
  const pacing = new Map(models.map((model) => [model.id, { nextSlotAt: 0 }]));
  const stats = new Map<string, ModelStats>(
    models.map((model) => [model.id, { requests: 0, items: 0, tokens: 0 }]),
  );
  const availability = new Map<string, Availability>(
    models.map((model) => [model.id, { availableAt: 0, overloadStreak: 0, dropped: false }]),
  );
  let requestsMade = 0;

  const statsOf = (model: LlmModel) => stats.get(model.id) as ModelStats;
  const availabilityOf = (model: LlmModel) => availability.get(model.id) as Availability;
  const pacingOf = (model: LlmModel) => pacing.get(model.id) as { nextSlotAt: number };

  /** Waits for this model's next slot under its `requestsPerMinute` budget, and counts the request. */
  async function paced(model: LlmModel): Promise<void> {
    if (maxRequests !== undefined && requestsMade >= maxRequests) {
      throw new StopRun(`max ${maxRequests} requests reached`);
    }
    requestsMade += 1;
    statsOf(model).requests += 1;
    const now = Date.now();
    const slot = Math.max(now, pacingOf(model).nextSlotAt);
    pacingOf(model).nextSlotAt = slot + 60_000 / model.requestsPerMinute;
    if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
  }

  /** Token pacing: pushes the model's next slot back by the largest share of a minute's token budget (total, or output-only) this request used. */
  function recordTokens(
    model: LlmModel,
    tokens: number | undefined,
    outputTokens: number | undefined,
  ): void {
    statsOf(model).tokens += tokens ?? 0;
    const minutes = Math.max(
      tokens !== undefined && model.tokensPerMinute !== undefined
        ? tokens / model.tokensPerMinute
        : 0,
      outputTokens !== undefined && model.outputTokensPerMinute !== undefined
        ? outputTokens / model.outputTokensPerMinute
        : 0,
    );
    pacingOf(model).nextSlotAt = Math.max(
      pacingOf(model).nextSlotAt,
      Date.now() + minutes * 60_000,
    );
  }

  /**
   * One paced call on one model, retrying in place on a per-minute limit
   * (`RetryLater`, up to 5 times) and on overload up to the model's own
   * `overloadRetries`; anything else propagates to the rotation. Recursion
   * rather than a loop so the awaited calls don't trip `no-await-in-loop`.
   */
  async function callPaced<T>(
    model: LlmModel,
    prompt: Prompt<T>,
    attempt = 0,
    overloadAttempt = 0,
  ): Promise<T[]> {
    await paced(model);
    try {
      const { results, tokens, outputTokens } = await callModel(model, prompt);
      recordTokens(model, tokens, outputTokens);
      return results;
    } catch (error) {
      if (error instanceof RetryLater && attempt < 5) {
        console.warn(
          `${model.id}: ${error.message} — retrying in ${Math.round(error.waitMs / 1000)}s`,
        );
        await new Promise((resolve) => setTimeout(resolve, error.waitMs));
        return callPaced(model, prompt, attempt + 1, overloadAttempt);
      }
      if (
        error instanceof ModelUnavailable &&
        !error.daily &&
        overloadAttempt < model.overloadRetries
      ) {
        console.warn(`${model.id}: ${error.message} — retrying in 10s`);
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        return callPaced(model, prompt, attempt, overloadAttempt + 1);
      }
      if (error instanceof RetryLater) throw new ModelUnavailable(error.message, false);
      throw error;
    }
  }

  /** Books the outcome of a failed attempt on this model's availability. */
  function rest(model: LlmModel, error: ModelUnavailable): void {
    const slot = availabilityOf(model);
    if (error.daily) {
      // No reset time known: treat it as spent for the run.
      if (error.retryAt === undefined) slot.dropped = true;
      else slot.availableAt = error.retryAt;
      console.warn(
        `${model.id}: ${error.message} — ${slot.dropped ? "dropped for this run" : `resting until ${clock(slot.availableAt)}`}`,
      );
      return;
    }
    slot.overloadStreak += 1;
    if (slot.overloadStreak >= MAX_OVERLOAD_STREAK) {
      slot.dropped = true;
      console.warn(
        `${model.id}: ${error.message} — ${slot.overloadStreak} in a row, dropped for this run`,
      );
      return;
    }
    const backoff = Math.min(
      OVERLOAD_BACKOFF_MS * 2 ** (slot.overloadStreak - 1),
      OVERLOAD_BACKOFF_CAP_MS,
    );
    slot.availableAt = Date.now() + backoff;
    console.warn(`${model.id}: ${error.message} — resting ${backoff / 60_000} min`);
  }

  async function next<I, T>(
    items: readonly I[],
    cursor: number,
    prompt: (batch: I[]) => Prompt<T>,
    sizeOf: (model: LlmModel) => number = (model) => model.batchSize,
  ): Promise<{ batch: I[]; results: T[]; model: LlmModel }> {
    const candidates = models.filter((model) => !availabilityOf(model).dropped);
    if (candidates.length === 0) throw new StopRun("no model left to try this run");
    const now = Date.now();
    const model = candidates.find((candidate) => availabilityOf(candidate).availableAt <= now);
    if (!model) {
      const soonest = candidates.reduce((best, candidate) =>
        availabilityOf(candidate).availableAt < availabilityOf(best).availableAt ? candidate : best,
      );
      const nextAt = availabilityOf(soonest).availableAt;
      if (nextAt - now > maxIdleMinutes * 60_000) {
        throw new StopRun(
          `no model available before ${clock(nextAt)} (${soonest.id}) — re-run after that`,
        );
      }
      console.warn(`No model available — waiting until ${clock(nextAt)} for ${soonest.id}`);
      await new Promise((resolve) => setTimeout(resolve, nextAt - now));
      return next(items, cursor, prompt, sizeOf);
    }
    const batch = items.slice(cursor, cursor + Math.max(1, sizeOf(model)));
    try {
      const results = await callPaced(model, prompt(batch));
      availabilityOf(model).overloadStreak = 0;
      return { batch, results, model };
    } catch (error) {
      if (!(error instanceof ModelUnavailable)) throw error;
      rest(model, error);
      return next(items, cursor, prompt, sizeOf);
    }
  }

  return {
    next,
    countItems: (model, count) => {
      statsOf(model).items += count;
    },
    stats: () => stats,
    requestsMade: () => requestsMade,
  };
}
