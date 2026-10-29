import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './db/database.module';
import { HealthController } from './health/health.controller';
import { QueueGateway } from './realtime/queue.gateway';
import { RedisModule } from './realtime/redis.module';
import { TicketsModule } from './tickets/tickets.module';
import { VenuesModule } from './venues/venues.module';

@Module({
  imports: [DatabaseModule, RedisModule, AuthModule, VenuesModule, TicketsModule, AdminModule],
  controllers: [HealthController],
  providers: [QueueGateway],
})
export class AppModule {}
