import { describe, expect, it, afterAll } from 'vitest';
import { S3StorageProvider } from './s3.provider.js';
import { parseEnv } from '../../config/env.js';

describe.skipIf(!process.env['USE_REAL_S3_IN_TESTS'])('S3StorageProvider (Integration)', () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CORS_ORIGINS: 'http://localhost:3000',
    S3_ENDPOINT: process.env['S3_ENDPOINT'],
    S3_PUBLIC_ENDPOINT: process.env['S3_PUBLIC_ENDPOINT'],
    S3_ACCESS_KEY: process.env['S3_ACCESS_KEY'],
    S3_SECRET_KEY: process.env['S3_SECRET_KEY'],
    S3_BUCKET: process.env['S3_BUCKET'],
  });

  const provider = new S3StorageProvider(env);
  const testKey = `test/${Date.now()}-file.txt`;
  const copyKey = `test/${Date.now()}-copy.txt`;

  afterAll(async () => {
    try {
      await provider.deleteObject(testKey);
      await provider.deleteObject(copyKey);
    } catch {
      // ignore
    }
  });

  it('should presign upload, PUT the file, HEAD it, and GET it', async () => {
    const content = 'Hello, MinIO!';
    const uploadUrl = await provider.presignUpload({
      key: testKey,
      contentType: 'text/plain',
      contentLength: content.length,
    });

    // 1. PUT (via fetch natif)
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: content,
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(putRes.status).toBe(200);

    // 2. HEAD
    const head = await provider.headObject(testKey);
    expect(head).not.toBeNull();
    expect(head?.size).toBe(content.length);

    // 3. GET (via URL pré-signée)
    const downloadUrl = await provider.presignDownload(testKey, 'test.txt');
    const getRes = await fetch(downloadUrl);
    expect(getRes.status).toBe(200);
    const body = await getRes.text();
    expect(body).toBe(content);
  });

  it('should copy an object', async () => {
    await provider.copyObject(testKey, copyKey);
    const head = await provider.headObject(copyKey);
    expect(head).not.toBeNull();
  });

  it('should delete objects', async () => {
    await provider.deleteMany([testKey, copyKey]);
    const head = await provider.headObject(testKey);
    expect(head).toBeNull();
  });
});
