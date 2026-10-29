import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { config, NOTIFICATIONS_QUEUE } from '../config';
import { redisConnection } from './jobs.producer';
import { NotificationsProcessor } from './notifications.processor';

/** Runs only in the worker process (src/worker.ts), never inside the API. */
@Injectable()
export class JobsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsWorker.name);
  private worker?: Worker;
  private scheduler?: Queue;

  constructor(private readonly processor: NotificationsProcessor) {}

  async onModuleInit() {
    // One scheduler entry no matter how many worker replicas start: upsert is idempotent.
    this.scheduler = new Queue(NOTIFICATIONS_QUEUE, { connection: redisConnection() });
    await this.scheduler.upsertJobScheduler('sweep', { every: config.sweepEveryMs }, { name: 'sweep', data: {} });

    this.worker = new Worker(NOTIFICATIONS_QUEUE, (job) => this.handle(job), {
      connection: redisConnection(),
      concurrency: 5,
    });
    this.worker.on('failed', (job, error) =>
      this.logger.warn(`job ${job?.name}#${job?.id} failed (attempt ${job?.attemptsMade}): ${error.message}`),
    );
    this.logger.log(`listening on queue "${NOTIFICATIONS_QUEUE}"`);
  }

  private async handle(job: Job) {
    switch (job.name) {
      case 'check-upcoming':
        return { notified: (await this.processor.checkUpcoming(job.data.venueId)).length };
      case 'sweep':
        return this.processor.sweep();
      default:
        throw new Error(`Unknown job ${job.name}`);
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.scheduler?.close();
  }
}
