import {
  S3Client,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { StorageProvider, PresignUploadParams, HeadObjectResult } from './types.js';
import type { Env } from '../../config/env.js';

export class S3StorageProvider implements StorageProvider {
  private readonly internalClient: S3Client;
  private readonly publicClient: S3Client;
  private readonly bucket: string;

  constructor(env: Env) {
    this.bucket = env.S3_BUCKET;
    const commonConfig = {
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      forcePathStyle: true,
    };

    // Client pour les opérations serveur (réseau Docker)
    this.internalClient = new S3Client({
      ...commonConfig,
      endpoint: env.S3_ENDPOINT,
    });

    // Client pour générer les URLs pré-signées (navigateur)
    this.publicClient = new S3Client({
      ...commonConfig,
      endpoint: env.S3_PUBLIC_ENDPOINT,
    });
  }

  async presignUpload(params: PresignUploadParams): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
      ChecksumSHA256: params.checksumSha256,
    });

    return getSignedUrl(this.publicClient, command, { expiresIn: 600 }); // 10 min
  }

  async presignDownload(key: string, filename: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
    });

    return getSignedUrl(this.publicClient, command, { expiresIn: 300 }); // 5 min
  }

  async headObject(key: string): Promise<HeadObjectResult | null> {
    try {
      const command = new HeadObjectCommand({ Bucket: this.bucket, Key: key });
      const response = await this.internalClient.send(command);

      const result: HeadObjectResult = {
        size: response.ContentLength ?? 0,
      };

      if (response.ContentType !== undefined) {
        result.contentType = response.ContentType;
      }
      if (response.ChecksumSHA256 !== undefined) {
        result.checksumSha256 = response.ChecksumSHA256;
      }

      return result;
    } catch {
      return null;
    }
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey}`,
      Key: destinationKey,
    });
    await this.internalClient.send(command);
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
    await this.internalClient.send(command);
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const command = new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    });
    await this.internalClient.send(command);
  }
}
