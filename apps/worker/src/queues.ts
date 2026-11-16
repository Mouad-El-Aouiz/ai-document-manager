import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const QUEUE_MAINTENANCE = 'maintenance';

export function createMaintenanceQueue(redis: Redis): Queue {
  return new Queue(QUEUE_MAINTENANCE, { connection: redis });
}
