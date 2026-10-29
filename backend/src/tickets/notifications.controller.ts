import { Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { DatabaseService } from '../db/database.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly db: DatabaseService) {}

  @Get('me')
  async mine(@CurrentUser() user: AuthUser) {
    const rows = await this.db.query<{
      id: string;
      ticket_id: string;
      type: string;
      message: string;
      read_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, ticket_id, type, message, read_at, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [user.id],
    );
    return rows.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      type: r.type,
      message: r.message,
      read: r.read_at !== null,
      createdAt: r.created_at.toISOString(),
    }));
  }

  @Post(':id/read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const row = await this.db.one(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user.id],
    );
    if (!row) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' });
  }
}
