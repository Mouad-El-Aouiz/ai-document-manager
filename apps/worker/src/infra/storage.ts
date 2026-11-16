import {
  S3Client,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type { Env } from '../config/env.js';

export interface WorkerStorage {
  deleteObject(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
  headObject(key: string): Promise<{ size: number } | null>;
}

export function createWorkerStorage(env: Env): WorkerStorage {
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    forcePathStyle: true,
  });

  return {
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    },
    async deleteMany(keys) {
      if (keys.length === 0) return;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: env.S3_BUCKET,
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        }),
      );
    },
    async headObject(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
        return { size: res.ContentLength ?? 0 };
      } catch {
        return null;
      }
    },
  };
}
