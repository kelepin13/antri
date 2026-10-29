import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { CallNextDto, FinishTicketDto, VenueOpenDto } from './tickets.dto';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@ApiBearerAuth()
@Controller()
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post('venues/:venueId/tickets')
  @Roles('CUSTOMER')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Unique per join attempt; reuse it when retrying' })
  async join(
    @CurrentUser() user: AuthUser,
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { ticket, replayed } = await this.tickets.join(user, venueId, idempotencyKey);
    // 201 for a new ticket, 200 + marker header when the same request is replayed.
    res.status(replayed ? 200 : 201);
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return ticket;
  }

  @Get('tickets/me')
  mine(@CurrentUser() user: AuthUser) {
    return this.tickets.listForUser(user);
  }

  @Get('tickets/:ticketId')
  get(@CurrentUser() user: AuthUser, @Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.tickets.getForUser(user, ticketId);
  }

  @Post('tickets/:ticketId/cancel')
  @Roles('CUSTOMER')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.tickets.cancel(user, ticketId);
  }

  // ---- Staff console ----

  @Get('staff/queue')
  @Roles('STAFF')
  staffQueue(@CurrentUser() user: AuthUser) {
    return this.tickets.staffQueue(user);
  }

  @Post('staff/call-next')
  @Roles('STAFF')
  @HttpCode(200)
  callNext(@CurrentUser() user: AuthUser, @Body() dto: CallNextDto) {
    return this.tickets.callNext(user, dto.counter.trim(), dto.completePrevious ?? true);
  }

  @Post('staff/tickets/:ticketId/finish')
  @Roles('STAFF')
  @HttpCode(200)
  finish(
    @CurrentUser() user: AuthUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: FinishTicketDto,
  ) {
    return this.tickets.finish(user, ticketId, dto.outcome);
  }

  @Patch('staff/venue')
  @Roles('STAFF')
  setOpen(@CurrentUser() user: AuthUser, @Body() dto: VenueOpenDto) {
    return this.tickets.setVenueOpen(user, dto.isOpen);
  }
}
