-- Admins manage venues and staff accounts from the web dashboard.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('CUSTOMER', 'STAFF', 'ADMIN'));

-- Venue names must be unique so admins can't create look-alike duplicates by accident.
CREATE UNIQUE INDEX venues_name_key ON venues (lower(name));
