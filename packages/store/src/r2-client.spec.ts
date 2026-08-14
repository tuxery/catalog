import type { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createR2Client } from "./r2-client";

const CONFIG = {
  accountId: "acc",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucketName: "tuxery-catalog",
};

describe("createR2Client", () => {
  it("publishes the body to the configured bucket and key", async () => {
    const send = vi.fn<S3Client["send"]>().mockResolvedValue({} as never);
    const fakeClient = { send } as unknown as S3Client;

    const client = createR2Client(CONFIG, fakeClient);
    await client.publish("dataset.json", '{"packages":[]}');

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe("tuxery-catalog");
    expect(command.input.Key).toBe("dataset.json");
    expect(command.input.Body).toBe('{"packages":[]}');
  });
});
