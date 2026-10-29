import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';

export interface VenueSnapshot {
  id: string;
  name: string;
  category: string;
  address: string;
  isOpen: boolean;
  waitingCount: number;
  lastIssuedNumber: number;
  nowServing: { number: number; counter: string | null }[];
  /** Average minutes per customer, measured from today's served tickets when there are enough. */
  avgServiceMinutes: number;
  estimatedWaitMinutes: number;
  updatedAt: string;
}

interface SnapshotRow {
  id: string;
  name: string;
  category: string;
  address: string;
  is_open: boolean;
  waiting_count: number;
  last_issued_number: number;
  now_serving: { number: number; counter: string | null }[];
  avg_service_minutes: number;
}

// "Today" is evaluated in each venue's own time zone, so a queue resets at local midnight.
const SNAPSHOT_SQL = `
  SELECT v.id, v.name, v.category, v.address, v.is_open,
         COALESCE(stats.waiting_count, 0)::int      AS waiting_count,
         COALESCE(stats.last_issued_number, 0)::int AS last_issued_number,
         COALESCE(serving.items, '[]'::json)        AS now_serving,
         -- Use measured speed once 3+ customers were served today; otherwise the venue default.
         CASE WHEN measured.samples >= 3 THEN GREATEST(1, round(measured.avg_minutes))::int
              ELSE v.avg_service_minutes END        AS avg_service_minutes
  FROM venues v
  CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE v.timezone)::date AS today) d
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE t.status = 'WAITING') AS waiting_count,
           max(t.number)                            AS last_issued_number
    FROM tickets t
    WHERE t.venue_id = v.id AND t.service_date = d.today
  ) stats ON true
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('number', t.number, 'counter', t.counter) ORDER BY t.called_at DESC) AS items
    FROM tickets t
    WHERE t.venue_id = v.id AND t.service_date = d.today AND t.status = 'CALLED'
  ) serving ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS samples,
           avg(extract(epoch FROM (s.finished_at - s.called_at)) / 60.0) AS avg_minutes
    FROM (
      SELECT finished_at, called_at FROM tickets t
      WHERE t.venue_id = v.id AND t.service_date = d.today AND t.status = 'SERVED'
      ORDER BY t.finished_at DESC
      LIMIT 20
    ) s
  ) measured ON true
`;

@Injectable()
export class VenuesService {
  constructor(private readonly db: DatabaseService) {}

  async list(): Promise<VenueSnapshot[]> {
    const rows = await this.db.query<SnapshotRow>(`${SNAPSHOT_SQL} ORDER BY v.name`);
    return rows.map(toSnapshot);
  }

  async snapshot(venueId: string): Promise<VenueSnapshot> {
    const row = await this.db.one<SnapshotRow>(`${SNAPSHOT_SQL} WHERE v.id = $1`, [venueId]);
    if (!row) throw new NotFoundException({ code: 'VENUE_NOT_FOUND', message: 'Venue not found' });
    return toSnapshot(row);
  }
}

function toSnapshot(row: SnapshotRow): VenueSnapshot {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    address: row.address,
    isOpen: row.is_open,
    waitingCount: row.waiting_count,
    lastIssuedNumber: row.last_issued_number,
    nowServing: row.now_serving,
    avgServiceMinutes: row.avg_service_minutes,
    estimatedWaitMinutes: row.waiting_count * row.avg_service_minutes,
    updatedAt: new Date().toISOString(),
  };
}
