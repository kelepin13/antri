import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { config, VENUE_CHANGED_CHANNEL } from '../config';

export const REDIS = Symbol('REDIS');

/**
 * Publishes "venue changed" events on a Redis channel. Every API instance subscribes
 * and pushes a fresh snapshot to its own WebSocket clients, so the API can run as
 * several replicas and the worker (a separate process) can trigger live updates too.
 */
@Injectable()
export class VenueEvents {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async changed(venueId: string): Promise<void> {
    await this.redis.publish(VENUE_CHANGED_CHANNEL, venueId);
  }
}

@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    { provide: REDIS, useFactory: () => new Redis(config.redisUrl, { maxRetriesPerRequest: null }) },
    VenueEvents,
    RedisLifecycle,
  ],
  exports: [REDIS, VenueEvents],
})
export class RedisModule {}
