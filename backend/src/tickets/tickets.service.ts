import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { AuthUser } from '../common/auth.decorators';
import { DatabaseService, isUniqueViolation } from '../db/database.service';
import { JobsProducer } from '../jobs/jobs.producer';
import { PushSender } from '../jobs/push.sender';
import { VenueEvents } from '../realtime/redis.module';
import { VenuesService } from '../venues/venues.service';
import { TICKET_VIEW_SQL, TicketRow, TicketView, TicketViewRow, toTicketView } from './ticket.types';

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

interface VenueToday {
  id: string;
  is_open: boolean;
  today: string;
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly venues: VenuesService,
    private readonly events: VenueEvents,
    private readonly jobs: JobsProducer,
    private readonly push: PushSender,
  ) {}

  /**
   * Takes a number at a venue.
   *
   * - Numbers are gap-free per venue per day: a transaction-scoped advisory lock on the
   *   venue serialises number assignment, and a unique constraint backs it up.
   * - The client sends an Idempotency-Key. Retrying the same request (flaky network,
   *   double tap) returns the original ticket instead of creating a second one.
   */
  async join(user: AuthUser, venueId: string, idempotencyKey: string): Promise<{ ticket: TicketView; replayed: boolean }> {
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey ?? '')) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Send an Idempotency-Key header of 8-100 letters, digits, "-" or "_"',
      });
    }

    let result: { ticketId: string; replayed: boolean };
    try {
      result = await this.db.transaction((client) => this.joinInTransaction(client, user, venueId, idempotencyKey));
    } catch (error) {
      // Same key used concurrently for a *different* venue: the other request won.
      if (isUniqueViolation(error, 'tickets_idempotency_key')) {
        const existing = await this.findByIdempotencyKey(user.id, idempotencyKey);
        if (existing) result = this.replayOrReject(existing, venueId);
        else throw error;
      } else {
        throw error;
      }
    }

    if (!result.replayed) await this.afterQueueChange(venueId);
    return { ticket: await this.view(result.ticketId), replayed: result.replayed };
  }

  private async joinInTransaction(
    client: PoolClient,
    user: AuthUser,
    venueId: string,
    idempotencyKey: string,
  ): Promise<{ ticketId: string; replayed: boolean }> {
    const venue = await this.venueToday(client, venueId);

    // Serialise everything that issues numbers at this venue until COMMIT.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('venue:' || $1::text, 0))`, [venueId]);

    // Checked after the lock, so two identical requests in flight resolve to one ticket.
    const previous = await client.query<TicketRow>(
      'SELECT * FROM tickets WHERE user_id = $1 AND idempotency_key = $2',
      [user.id, idempotencyKey],
    );
    if (previous.rows[0]) return this.replayOrReject(previous.rows[0], venueId);

    if (!venue.is_open) {
      throw new ConflictException({ code: 'VENUE_CLOSED', message: 'This venue is not taking new tickets right now' });
    }

    const active = await client.query<{ id: string }>(
      `SELECT id FROM tickets WHERE user_id = $1 AND venue_id = $2 AND status IN ('WAITING', 'CALLED')`,
      [user.id, venueId],
    );
    if (active.rows[0]) {
      throw new ConflictException({
        code: 'ALREADY_IN_QUEUE',
        message: 'You already have an active ticket at this venue',
        ticketId: active.rows[0].id,
      });
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tickets (venue_id, user_id, service_date, number, idempotency_key)
       SELECT $1, $2, $3::date, COALESCE(max(number), 0) + 1, $4
       FROM tickets WHERE venue_id = $1 AND service_date = $3::date
       RETURNING id`,
      [venueId, user.id, venue.today, idempotencyKey],
    );
    return { ticketId: inserted.rows[0].id, replayed: false };
  }

  private replayOrReject(ticket: TicketRow, venueId: string) {
    if (ticket.venue_id !== venueId) {
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'This Idempotency-Key was already used for a different request',
      });
    }
    return { ticketId: ticket.id, replayed: true };
  }

  /**
   * Staff calls the next customer to `counter`.
   *
   * `FOR UPDATE SKIP LOCKED` lets several counters call at the same moment: each
   * transaction skips rows another one has already claimed, so no two counters ever
   * get the same ticket and nobody waits on a lock.
   */
  async callNext(staff: AuthUser, counter: string, completePrevious = true) {
    const venueId = this.staffVenue(staff);
    const { called, completed } = await this.db.transaction(async (client) => {
      const venue = await this.venueToday(client, venueId);

      let completed: string[] = [];
      if (completePrevious) {
        const done = await client.query<{ id: string }>(
          `UPDATE tickets SET status = 'SERVED', finished_at = now()
           WHERE venue_id = $1 AND status = 'CALLED' AND counter = $2
           RETURNING id`,
          [venueId, counter],
        );
        completed = done.rows.map((r) => r.id);
      }

      const next = await client.query<TicketRow>(
        `WITH next AS (
           SELECT id FROM tickets
           WHERE venue_id = $1 AND service_date = $2::date AND status = 'WAITING'
           ORDER BY number
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE tickets t SET status = 'CALLED', counter = $3, called_at = now()
         FROM next WHERE t.id = next.id
         RETURNING t.*`,
        [venueId, venue.today, counter],
      );
      const called = next.rows[0] ?? null;
      if (called) {
        await client.query(
          `INSERT INTO notifications (user_id, ticket_id, type, message)
           VALUES ($1, $2, 'CALLED', $3)
           ON CONFLICT (ticket_id, type) DO NOTHING`,
          [called.user_id, called.id, `Ticket #${called.number}: it's your turn! Please go to ${counter}.`],
        );
      }
      return { called, completed };
    });

    if (called || completed.length) await this.afterQueueChange(venueId);
    if (called) {
      await this.push.send([
        { userId: called.user_id, ticketId: called.id, message: `Ticket #${called.number}: please go to ${counter}` },
      ]);
    }
    return {
      ticket: called ? await this.view(called.id) : null,
      completedTicketIds: completed,
    };
  }

  /** CALLED -> SERVED or NO_SHOW. The WHERE clause is the state machine: any other transition is rejected. */
  async finish(staff: AuthUser, ticketId: string, outcome: 'SERVED' | 'NO_SHOW'): Promise<TicketView> {
    const venueId = this.staffVenue(staff);
    const updated = await this.db.one<{ id: string }>(
      `UPDATE tickets SET status = $3, finished_at = now()
       WHERE id = $1 AND venue_id = $2 AND status = 'CALLED'
       RETURNING id`,
      [ticketId, venueId, outcome],
    );
    if (!updated) await this.explainFailedTransition(ticketId, venueId, 'CALLED');
    await this.afterQueueChange(venueId);
    return this.view(ticketId);
  }

  /** Customer leaves the queue. Only a WAITING ticket can be cancelled. */
  async cancel(user: AuthUser, ticketId: string): Promise<TicketView> {
    const updated = await this.db.one<{ venue_id: string }>(
      `UPDATE tickets SET status = 'CANCELLED', finished_at = now()
       WHERE id = $1 AND user_id = $2 AND status = 'WAITING'
       RETURNING venue_id`,
      [ticketId, user.id],
    );
    if (!updated) await this.explainFailedTransition(ticketId, null, 'WAITING', user.id);
    await this.afterQueueChange(updated!.venue_id);
    return this.view(ticketId);
  }

  async getForUser(user: AuthUser, ticketId: string): Promise<TicketView> {
    const row = await this.db.one<TicketViewRow>(`${TICKET_VIEW_SQL} WHERE t.id = $1`, [ticketId]);
    const allowed = row && (row.user_id === user.id || (user.role === 'STAFF' && user.venueId === row.venue_id));
    if (!allowed) throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found' });
    return this.withMeasuredWait(row);
  }

  /** Active tickets first, then the last few finished ones. */
  async listForUser(user: AuthUser): Promise<TicketView[]> {
    const rows = await this.db.query<TicketViewRow>(
      `${TICKET_VIEW_SQL}
       WHERE t.user_id = $1 AND t.created_at > now() - interval '7 days'
       ORDER BY (t.status IN ('WAITING', 'CALLED')) DESC, t.created_at DESC
       LIMIT 20`,
      [user.id],
    );
    return Promise.all(rows.map((r) => this.withMeasuredWait(r)));
  }

  /** What the staff console shows: snapshot plus the waiting and called lists. */
  async staffQueue(staff: AuthUser) {
    const venueId = this.staffVenue(staff);
    const snapshot = await this.venues.snapshot(venueId);
    const rows = await this.db.query<{
      id: string;
      number: number;
      status: string;
      counter: string | null;
      customer_name: string;
      created_at: Date;
      called_at: Date | null;
    }>(
      `SELECT t.id, t.number, t.status, t.counter, u.name AS customer_name, t.created_at, t.called_at
       FROM tickets t
       JOIN venues v ON v.id = t.venue_id
       JOIN users u ON u.id = t.user_id
       WHERE t.venue_id = $1 AND t.service_date = (now() AT TIME ZONE v.timezone)::date
         AND t.status IN ('WAITING', 'CALLED')
       ORDER BY t.number`,
      [venueId],
    );
    const item = (r: (typeof rows)[number]) => ({
      id: r.id,
      number: r.number,
      counter: r.counter,
      customerName: r.customer_name,
      createdAt: r.created_at.toISOString(),
      calledAt: r.called_at?.toISOString() ?? null,
    });
    return {
      venue: snapshot,
      called: rows.filter((r) => r.status === 'CALLED').map(item),
      waiting: rows.filter((r) => r.status === 'WAITING').map(item),
    };
  }

  async setVenueOpen(staff: AuthUser, isOpen: boolean) {
    const venueId = this.staffVenue(staff);
    await this.db.query('UPDATE venues SET is_open = $2 WHERE id = $1', [venueId, isOpen]);
    await this.events.changed(venueId);
    return this.venues.snapshot(venueId);
  }

  async view(ticketId: string): Promise<TicketView> {
    const row = await this.db.one<TicketViewRow>(`${TICKET_VIEW_SQL} WHERE t.id = $1`, [ticketId]);
    if (!row) throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found' });
    return this.withMeasuredWait(row);
  }

  private async withMeasuredWait(row: TicketViewRow): Promise<TicketView> {
    if (row.people_ahead === null) return toTicketView(row);
    const { avgServiceMinutes } = await this.venues.snapshot(row.venue_id);
    return toTicketView(row, avgServiceMinutes);
  }

  private async afterQueueChange(venueId: string) {
    // Both are best-effort: the ticket is already committed. A missed live update is
    // fixed by the next change or a pull-to-refresh; a missed job by the next call.
    await Promise.allSettled([this.events.changed(venueId), this.jobs.checkUpcoming(venueId)]).then((results) =>
      results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .forEach((r) => this.logger.warn(`post-commit side effect failed: ${r.reason}`)),
    );
  }

  private async venueToday(client: PoolClient, venueId: string): Promise<VenueToday> {
    const venue = await client.query<VenueToday>(
      `SELECT id, is_open, to_char((now() AT TIME ZONE timezone)::date, 'YYYY-MM-DD') AS today
       FROM venues WHERE id = $1`,
      [venueId],
    );
    if (!venue.rows[0]) throw new NotFoundException({ code: 'VENUE_NOT_FOUND', message: 'Venue not found' });
    return venue.rows[0];
  }

  private staffVenue(user: AuthUser): string {
    if (user.role !== 'STAFF' || !user.venueId) {
      throw new ForbiddenException({ code: 'STAFF_ONLY', message: 'Only venue staff can do this' });
    }
    return user.venueId;
  }

  private async findByIdempotencyKey(userId: string, key: string) {
    return this.db.one<TicketRow>('SELECT * FROM tickets WHERE user_id = $1 AND idempotency_key = $2', [userId, key]);
  }

  private async explainFailedTransition(
    ticketId: string,
    venueId: string | null,
    expected: string,
    userId?: string,
  ): Promise<never> {
    const ticket = await this.db.one<{ status: string; venue_id: string; user_id: string }>(
      'SELECT status, venue_id, user_id FROM tickets WHERE id = $1',
      [ticketId],
    );
    const visible =
      ticket && (venueId === null || ticket.venue_id === venueId) && (userId === undefined || ticket.user_id === userId);
    if (!visible) throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found' });
    throw new ConflictException({
      code: 'INVALID_TRANSITION',
      message: `Ticket is ${ticket.status}; this action needs it to be ${expected}`,
      status: ticket.status,
    });
  }
}
