-- Antri initial schema.
-- Integrity rules live in the database, not just in application code:
-- unique ticket numbers per venue per day, one active ticket per user per venue,
-- idempotency keys per user, and status values checked by constraint.

CREATE TABLE venues (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  category             text NOT NULL,
  address              text NOT NULL,
  timezone             text NOT NULL DEFAULT 'Asia/Jakarta',
  avg_service_minutes  integer NOT NULL DEFAULT 5 CHECK (avg_service_minutes > 0),
  notify_ahead         integer NOT NULL DEFAULT 3 CHECK (notify_ahead >= 0),
  is_open              boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  password_hash  text NOT NULL,
  name           text NOT NULL,
  role           text NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'STAFF')),
  venue_id       uuid REFERENCES venues(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_has_venue CHECK (role <> 'STAFF' OR venue_id IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE tickets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_date     date NOT NULL,
  number           integer NOT NULL CHECK (number > 0),
  status           text NOT NULL DEFAULT 'WAITING'
                   CHECK (status IN ('WAITING', 'CALLED', 'SERVED', 'NO_SHOW', 'CANCELLED')),
  counter          text,
  idempotency_key  text NOT NULL,
  notified_at      timestamptz,
  called_at        timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tickets_number_per_day_key UNIQUE (venue_id, service_date, number),
  CONSTRAINT tickets_idempotency_key UNIQUE (user_id, idempotency_key)
);

-- A user can hold at most one active ticket per venue.
CREATE UNIQUE INDEX tickets_one_active_per_user
  ON tickets (user_id, venue_id)
  WHERE status IN ('WAITING', 'CALLED');

-- Serves "who is next", positions and queue snapshots.
CREATE INDEX tickets_queue_idx ON tickets (venue_id, service_date, status, number);

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id   uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('ALMOST_UP', 'CALLED', 'NO_SHOW')),
  message     text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Makes notification jobs safe to retry: the same event is stored once.
  CONSTRAINT notifications_once_per_event UNIQUE (ticket_id, type)
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
