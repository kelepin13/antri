import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { config, NOTIFICATIONS_QUEUE } from '../config';

export type NotificationJob =
  | { name: 'check-upcoming'; data: { venueId: string } }
  | { name: 'sweep'; data: Record<string, never> };

export function redisConnection() {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

/** API-side producer. Heavy or retryable work goes to the worker instead of the request path. */
@Injectable()
export class JobsProducer implements OnModuleDestroy {
  readonly queue = new Queue(NOTIFICATIONS_QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });

  /**
   * Bursts of queue changes at one venue collapse into a single job: the dedup window
   * keeps a busy venue from flooding the worker. Correctness does not depend on this;
   * the job itself is idempotent.
   */
  async checkUpcoming(venueId: string): Promise<void> {
    await this.queue.add('check-upcoming', { venueId }, { deduplication: { id: `upcoming:${venueId}`, ttl: 1000 } });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
