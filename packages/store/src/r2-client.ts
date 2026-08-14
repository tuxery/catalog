import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export interface R2Client {
  publish(key: string, body: string): Promise<void>;
}

/**
 * R2 exposes an S3-compatible API for external tools — this is the write
 * side used by CI (a plain Node runner, not a Workers runtime, so it can't
 * use a native R2 binding). `app` reads the same bucket at request time
 * via the native Workers R2 binding instead, no credentials involved.
 *
 * `client` can be injected for testing; defaults to a real `S3Client`
 * pointed at the account's R2 endpoint.
 */
export function createR2Client(config: R2Config, client?: S3Client): R2Client {
  const s3 =
    client ??
    new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

  return {
    async publish(key, body) {
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          Body: body,
          ContentType: "application/json",
        }),
      );
    },
  };
}
