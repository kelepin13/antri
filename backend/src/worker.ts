import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from './db/database.module';
import { JobsWorker } from './jobs/jobs.worker';
import { NotificationsProcessor } from './jobs/notifications.processor';
import { PushSender } from './jobs/push.sender';
import { RedisModule } from './realtime/redis.module';

/** Background worker: no HTTP server, scales independently of the API. */
@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [NotificationsProcessor, PushSender, JobsWorker],
})
export class WorkerModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log('Worker started', 'Bootstrap');
}

void bootstrap();
