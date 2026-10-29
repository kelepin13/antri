import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { DatabaseService, isUniqueViolation } from '../db/database.service';
import { VenueEvents } from '../realtime/redis.module';
import { VenuesService } from '../venues/venues.service';
import { CreateStaffDto, CreateVenueDto, UpdateVenueDto } from './admin.dto';

export interface VenueStatsRow {
  venue_id: string;
  timezone: string;
  notify_ahead: number;
  configured_service_minutes: number;
  issued: number;
  served: number;
  no_show: number;
  cancelled: number;
  avg_wait_minutes: number | null;
  staff_count: number;
  hourly: number[];
}

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly venues: VenuesService,
    private readonly events: VenueEvents,
  ) {}

  /**
   * Every venue with its live snapshot and today's numbers: tickets issued, served,
   * no-shows, average wait (join -> called) and tickets per hour (venue local time).
   */
  async overview() {
    const [snapshots, stats] = await Promise.all([
      this.venues.list(),
      this.db.query<VenueStatsRow>(`
        SELECT v.id AS venue_id, v.timezone, v.notify_ahead, v.avg_service_minutes AS configured_service_minutes,
               count(t.id)::int                                              AS issued,
               count(t.id) FILTER (WHERE t.status = 'SERVED')::int           AS served,
               count(t.id) FILTER (WHERE t.status = 'NO_SHOW')::int          AS no_show,
               count(t.id) FILTER (WHERE t.status = 'CANCELLED')::int        AS cancelled,
               round(avg(extract(epoch FROM (t.called_at - t.created_at)) / 60.0)
                     FILTER (WHERE t.called_at IS NOT NULL))::int            AS avg_wait_minutes,
               (SELECT count(*)::int FROM users u WHERE u.venue_id = v.id AND u.role = 'STAFF') AS staff_count,
               (SELECT array_agg(coalesce(h.n, 0) ORDER BY g.hour)
                FROM generate_series(0, 23) AS g(hour)
                LEFT JOIN (
                  SELECT extract(hour FROM t2.created_at AT TIME ZONE v.timezone)::int AS hour, count(*)::int AS n
                  FROM tickets t2
                  WHERE t2.venue_id = v.id AND t2.service_date = (now() AT TIME ZONE v.timezone)::date
                  GROUP BY 1
                ) h ON h.hour = g.hour)                                      AS hourly
        FROM venues v
        LEFT JOIN tickets t ON t.venue_id = v.id AND t.service_date = (now() AT TIME ZONE v.timezone)::date
        GROUP BY v.id`),
    ]);
    const byVenue = new Map(stats.map((s) => [s.venue_id, s]));
    return snapshots.map((venue) => {
      const s = byVenue.get(venue.id)!;
      return {
        ...venue,
        today: {
          issued: s.issued,
          served: s.served,
          noShow: s.no_show,
          cancelled: s.cancelled,
          avgWaitMinutes: s.avg_wait_minutes,
          ticketsPerHour: s.hourly,
        },
        staffCount: s.staff_count,
        timezone: s.timezone,
        notifyAhead: s.notify_ahead,
        /** The admin's setting; `avgServiceMinutes` may be the measured value instead. */
        configuredServiceMinutes: s.configured_service_minutes,
      };
    });
  }

  async createVenue(dto: CreateVenueDto) {
    const timezone = dto.timezone ?? 'Asia/Jakarta';
    await this.assertTimezone(timezone);
    try {
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO venues (name, category, address, timezone, avg_service_minutes, notify_ahead)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [dto.name.trim(), dto.category.trim(), dto.address.trim(), timezone, dto.avgServiceMinutes ?? 5, dto.notifyAhead ?? 3],
      );
      return this.venues.snapshot(row!.id);
    } catch (error) {
      throw this.mapVenueError(error);
    }
  }

  async updateVenue(id: string, dto: UpdateVenueDto) {
    if (dto.timezone !== undefined) await this.assertTimezone(dto.timezone);
    const columns: Record<string, unknown> = {
      name: dto.name?.trim(),
      category: dto.category?.trim(),
      address: dto.address?.trim(),
      timezone: dto.timezone,
      avg_service_minutes: dto.avgServiceMinutes,
      notify_ahead: dto.notifyAhead,
      is_open: dto.isOpen,
    };
    const entries = Object.entries(columns).filter(([, value]) => value !== undefined);
    if (entries.length === 0) throw new BadRequestException({ code: 'NOTHING_TO_UPDATE', message: 'No fields to update' });

    // Column names come from the fixed map above, never from the request.
    const assignments = entries.map(([column], i) => `${column} = $${i + 2}`).join(', ');
    try {
      const row = await this.db.one(`UPDATE venues SET ${assignments} WHERE id = $1 RETURNING id`, [
        id,
        ...entries.map(([, value]) => value),
      ]);
      if (!row) throw new NotFoundException({ code: 'VENUE_NOT_FOUND', message: 'Venue not found' });
    } catch (error) {
      throw this.mapVenueError(error);
    }
    await this.events.changed(id);
    return this.venues.snapshot(id);
  }

  async listStaff() {
    const rows = await this.db.query<{
      id: string;
      email: string;
      name: string;
      venue_id: string;
      venue_name: string;
      created_at: Date;
    }>(
      `SELECT u.id, u.email, u.name, u.venue_id, v.name AS venue_name, u.created_at
       FROM users u JOIN venues v ON v.id = u.venue_id
       WHERE u.role = 'STAFF'
       ORDER BY v.name, u.name`,
    );
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      venueId: r.venue_id,
      venueName: r.venue_name,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async createStaff(dto: CreateStaffDto) {
    const venue = await this.db.one('SELECT id FROM venues WHERE id = $1', [dto.venueId]);
    if (!venue) throw new NotFoundException({ code: 'VENUE_NOT_FOUND', message: 'Venue not found' });
    const hash = await bcrypt.hash(dto.password, 10);
    try {
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO users (email, password_hash, name, role, venue_id)
         VALUES ($1, $2, $3, 'STAFF', $4) RETURNING id`,
        [dto.email.trim(), hash, dto.name.trim(), dto.venueId],
      );
      return (await this.listStaff()).find((s) => s.id === row!.id);
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_key')) {
        throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'An account with this email already exists' });
      }
      throw error;
    }
  }

  /** Removes a staff account. Their venue's tickets are untouched. */
  async deleteStaff(id: string) {
    const row = await this.db.one(`DELETE FROM users WHERE id = $1 AND role = 'STAFF' RETURNING id`, [id]);
    if (!row) throw new NotFoundException({ code: 'STAFF_NOT_FOUND', message: 'Staff account not found' });
  }

  private async assertTimezone(timezone: string) {
    const known = await this.db.one('SELECT 1 FROM pg_timezone_names WHERE name = $1', [timezone]);
    if (!known) throw new BadRequestException({ code: 'INVALID_TIMEZONE', message: `Unknown time zone "${timezone}"` });
  }

  private mapVenueError(error: unknown) {
    if (isUniqueViolation(error, 'venues_name_key')) {
      return new ConflictException({ code: 'VENUE_NAME_TAKEN', message: 'A venue with this name already exists' });
    }
    return error;
  }
}
