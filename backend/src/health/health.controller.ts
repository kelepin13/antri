import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { Public } from '../common/auth.decorators';
import { DatabaseService } from '../db/database.service';
import { REDIS } from '../realtime/redis.module';

/** Used by the Docker health check and by load balancers. */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.db.query('SELECT 1').then(() => 'up', () => 'down'),
      this.redis.ping().then(() => 'up', () => 'down'),
    ]);
    const body = { status: database === 'up' && redis === 'up' ? 'ok' : 'error', database, redis };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
