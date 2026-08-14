import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createR2Client } from "@tuxery/store";
import { buildDataset } from "./build-dataset";

const OUT_PATH = join(process.cwd(), "dist", "dataset.json");

async function main() {
  const dataset = await buildDataset();
  const json = JSON.stringify(dataset, null, 2);

  const { CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } =
    process.env;

  if (CLOUDFLARE_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME) {
    const client = createR2Client({
      accountId: CLOUDFLARE_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucketName: R2_BUCKET_NAME,
    });
    await client.publish("dataset.json", json);
    console.log("Published dataset.json to R2.");
    return;
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, json);
  console.log(`R2 credentials not set — wrote dry-run dataset to ${OUT_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
