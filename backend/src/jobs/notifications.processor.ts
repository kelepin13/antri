import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';
import { DatabaseService } from '../db/database.service';
import { VenueEvents } from '../realtime/redis.module';
import { PushMessage, PushSender } from './push.sender';

/**
 * Job handlers. Every handler is safe to run twice: BullMQ retries failed jobs, and a
 * retry must never send the same notification twice or skip a state change.
 */
@Injectable()
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly push: PushSender,
    private readonly events: VenueEvents,
  ) {}

  /**
   * Marks the next `notify_ahead` waiting tickets as notified and stores one ALMOST_UP
   * notification each. `notified_at IS NULL` plus the (ticket_id, type) unique key make
   * this a no-op the second time.
   */
  async checkUpcoming(venueId: string): Promise<PushMessage[]> {
    const rows = await this.db.query<{ user_id: string; ticket_id: string; message: string }>(
      `
      WITH v AS (
        SELECT id, notify_ahead, (now() AT TIME ZONE timezone)::date AS today
        FROM venues WHERE id = $1
      ),
      upcoming AS (
        SELECT t.id FROM tickets t, v
        WHERE t.venue_id = v.id AND t.service_date = v.today AND t.status = 'WAITING'
        ORDER BY t.number
        LIMIT (SELECT notify_ahead FROM v)
      ),
      marked AS (
        UPDATE tickets t SET notified_at = now()
        FROM upcoming u
        WHERE t.id = u.id AND t.notified_at IS NULL
        RETURNING t.id, t.user_id, t.number
      )
      INSERT INTO notifications (user_id, ticket_id, type, message)
      SELECT user_id, id, 'ALMOST_UP', 'Ticket #' || number || ': you''re almost up. Please head to the venue.'
      FROM marked
      ON CONFLICT (ticket_id, type) DO NOTHING
      RETURNING user_id, ticket_id, message`,
      [venueId],
    );
    const messages = rows.map((r) => ({ userId: r.user_id, ticketId: r.ticket_id, message: r.message }));
    await this.push.send(messages);
    return messages;
  }

  /**
   * Periodic clean-up:
   *  - CALLED tickets nobody served within NO_SHOW_AFTER_MINUTES become NO_SHOW.
   *  - WAITING tickets from a previous day (venue local time) are cancelled.
   */
  async sweep(): Promise<{ noShows: number; expired: number }> {
    const { noShows, expired } = await this.db.transaction(async (client) => {
      const noShows = await client.query<{ id: string; user_id: string; venue_id: string; number: number }>(
        `UPDATE tickets SET status = 'NO_SHOW', finished_at = now()
         WHERE status = 'CALLED' AND called_at < now() - make_interval(mins => $1)
         RETURNING id, user_id, venue_id, number`,
        [config.noShowAfterMinutes],
      );
      if (noShows.rowCount) {
        await client.query(
          `INSERT INTO notifications (user_id, ticket_id, type, message)
           SELECT u.user_id, u.id, 'NO_SHOW', 'Ticket #' || u.number || ' was skipped because you did not arrive in time.'
           FROM jsonb_to_recordset($1::jsonb) AS u(id uuid, user_id uuid, number int)
           ON CONFLICT (ticket_id, type) DO NOTHING`,
          [JSON.stringify(noShows.rows)],
        );
      }
      const expired = await client.query<{ venue_id: string }>(
        `UPDATE tickets t SET status = 'CANCELLED', finished_at = now()
         FROM venues v
         WHERE t.venue_id = v.id AND t.status = 'WAITING'
           AND t.service_date < (now() AT TIME ZONE v.timezone)::date
         RETURNING t.venue_id`,
      );
      return { noShows: noShows.rows, expired: expired.rows };
    });

    const venues = new Set([...noShows.map((r) => r.venue_id), ...expired.map((r) => r.venue_id)]);
    await Promise.all([...venues].map((id) => this.events.changed(id)));
    if (noShows.length || expired.length) {
      this.logger.log(`sweep: ${noShows.length} no-show(s), ${expired.length} expired ticket(s)`);
    }
    return { noShows: noShows.length, expired: expired.length };
  }
}
