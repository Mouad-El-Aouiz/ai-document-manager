import type { Env } from '../../config/env.js';
import type { StorageProvider } from './types.js';
import { S3StorageProvider } from './s3.provider.js';
import { FakeStorageProvider } from './fake.provider.js';

export type { StorageProvider };

export function createStorageProvider(env: Env): StorageProvider {
  if (env.NODE_ENV === 'test' && !env.USE_REAL_S3_IN_TESTS) {
    return new FakeStorageProvider();
  }
  return new S3StorageProvider(env);
}
