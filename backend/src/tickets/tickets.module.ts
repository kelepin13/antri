import { Module } from '@nestjs/common';
import { JobsProducer } from '../jobs/jobs.producer';
import { PushSender } from '../jobs/push.sender';
import { VenuesModule } from '../venues/venues.module';
import { NotificationsController } from './notifications.controller';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [VenuesModule],
  controllers: [TicketsController, NotificationsController],
  providers: [TicketsService, JobsProducer, PushSender],
})
export class TicketsModule {}
