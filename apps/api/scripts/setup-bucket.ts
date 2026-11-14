import { S3Client, CreateBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { loadEnv } from '../src/config/env.js';

async function main() {
  const env = loadEnv();
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    forcePathStyle: true,
  });

  try {
    await client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    console.log(`Bucket ${env.S3_BUCKET} created`);
  } catch (e: unknown) {
    // Ignore if already exists
    if (e instanceof Error && e.name !== 'BucketAlreadyOwnedByYou') {
      console.log(`Bucket ${env.S3_BUCKET} already exists or error ignored`);
    }
  }

  const corsConfig = {
    Bucket: env.S3_BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['PUT', 'GET', 'HEAD'],
          AllowedOrigins: ['http://localhost:3000', 'http://localhost:5173'],
          ExposeHeaders: ['ETag', 'x-amz-checksum-sha256'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  };

  await client.send(new PutBucketCorsCommand(corsConfig));
  console.log('CORS configured on bucket');
}

main().catch(console.error);
