import { Redis } from 'ioredis';

export function createWorkerRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
