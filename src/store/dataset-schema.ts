import { z } from "zod";
import type { TursoDataset } from "./turso-client";

/**
 * The fields `publish` turns into columns, precomputed listings and browse
 * keys, checked before anything is written: `seed.ts` used to cast
 * `dist/dataset.json` straight to `TursoDataset`, so a truncated or
 * mis-shaped file would have been published as-is — at ~3M rows written
 * per publish, a third of the monthly write quota. Everything else on an
 * app passes through unchecked (`looseObject`): this guards the store's
 * own needs, it doesn't restate `CatalogApp`.
 */
const AppRecordSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  shortDescription: z.string(),
  kind: z.literal("gui").optional(),
  contentType: z.literal("game").optional(),
  category: z.string().optional(),
  licenseKind: z.enum(["free", "proprietary"]).optional(),
  lastUpdated: z.string().optional(),
  rating: z.object({ average: z.number(), count: z.number().nonnegative() }).optional(),
  popularity: z.number().min(0).max(1).optional(),
  installsTotal: z.number().nonnegative().optional(),
  installsLast7Days: z.number().nonnegative().optional(),
  dataConfidence: z.object({
    score: z.number(),
    signals: z.array(z.object({ signal: z.string(), delta: z.number(), detail: z.string() })),
  }),
  packages: z.array(z.unknown()).min(1),
});

const TursoDatasetSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    apps: z.array(AppRecordSchema),
  })
  .superRefine((dataset, ctx) => {
    const seen = new Set<string>();
    for (const app of dataset.apps) {
      if (seen.has(app.id)) {
        ctx.addIssue({ code: "custom", message: `duplicate app id "${app.id}"` });
        return;
      }
      seen.add(app.id);
    }
  });

/**
 * Parses and checks a dataset before publishing it. `minApps` is a floor
 * against publishing a truncated or sample dataset to a real database;
 * leave it at 0 for local seeding, where a small dev sample is fine.
 */
export function parseTursoDataset(raw: unknown, { minApps = 0 } = {}): TursoDataset {
  // Through `unknown`: the fields left unchecked stay as the file has them.
  const dataset = TursoDatasetSchema.parse(raw) as unknown as TursoDataset;
  if (dataset.apps.length < minApps) {
    throw new Error(
      `dataset has ${dataset.apps.length} apps, below the ${minApps} floor for a remote publish — truncated or a sample?`,
    );
  }
  return dataset;
}
