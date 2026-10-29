export type TicketStatus = 'WAITING' | 'CALLED' | 'SERVED' | 'NO_SHOW' | 'CANCELLED';

export interface TicketRow {
  id: string;
  venue_id: string;
  user_id: string;
  service_date: string;
  number: number;
  status: TicketStatus;
  counter: string | null;
  idempotency_key: string;
  notified_at: Date | null;
  called_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
}

export interface TicketView {
  id: string;
  venueId: string;
  venueName: string;
  number: number;
  status: TicketStatus;
  counter: string | null;
  serviceDate: string;
  /** Waiting tickets with a lower number. Null once the ticket is no longer waiting. */
  peopleAhead: number | null;
  estimatedWaitMinutes: number | null;
  createdAt: string;
  calledAt: string | null;
  finishedAt: string | null;
}

/** Selects a ticket plus what the customer screen needs: venue name and queue position. */
export const TICKET_VIEW_SQL = `
  SELECT t.id, t.venue_id, t.user_id, v.name AS venue_name, t.number, t.status, t.counter,
         to_char(t.service_date, 'YYYY-MM-DD') AS service_date,
         t.created_at, t.called_at, t.finished_at, v.avg_service_minutes,
         CASE WHEN t.status = 'WAITING' THEN (
           SELECT count(*)::int FROM tickets w
           WHERE w.venue_id = t.venue_id AND w.service_date = t.service_date
             AND w.status = 'WAITING' AND w.number < t.number
         ) END AS people_ahead
  FROM tickets t
  JOIN venues v ON v.id = t.venue_id
`;

export interface TicketViewRow {
  id: string;
  venue_id: string;
  user_id: string;
  venue_name: string;
  number: number;
  status: TicketStatus;
  counter: string | null;
  service_date: string;
  created_at: Date;
  called_at: Date | null;
  finished_at: Date | null;
  avg_service_minutes: number;
  people_ahead: number | null;
}

export function toTicketView(row: TicketViewRow, avgServiceMinutes = row.avg_service_minutes): TicketView {
  return {
    id: row.id,
    venueId: row.venue_id,
    venueName: row.venue_name,
    number: row.number,
    status: row.status,
    counter: row.counter,
    serviceDate: row.service_date,
    peopleAhead: row.people_ahead,
    estimatedWaitMinutes: row.people_ahead === null ? null : row.people_ahead * avgServiceMinutes,
    createdAt: row.created_at.toISOString(),
    calledAt: row.called_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}
