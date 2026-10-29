import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { config } from '../config';

/** Demo data. Safe to run repeatedly: existing rows are left alone. */
const VENUES = [
  { name: 'Klinik Sehat Bersama', category: 'Clinic', address: 'Jl. Melati No. 12, Tangerang Selatan', avg: 8, staff: 'staff.clinic@antri.dev' },
  { name: 'Potong Rapi Barbershop', category: 'Barbershop', address: 'Jl. Kenanga No. 5, Jakarta Selatan', avg: 20, staff: 'staff.barber@antri.dev' },
  { name: 'Paws & Care Pet Clinic', category: 'Pet care', address: 'Jl. Anggrek No. 30, Jakarta Barat', avg: 12, staff: 'staff.pets@antri.dev' },
];
const DEMO_PASSWORD = 'password123';

export async function seed(databaseUrl = config.databaseUrl, log = console.log) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await client.query('BEGIN');
    for (const v of VENUES) {
      const existing = await client.query<{ id: string }>('SELECT id FROM venues WHERE name = $1', [v.name]);
      const venueId =
        existing.rows[0]?.id ??
        (
          await client.query<{ id: string }>(
            `INSERT INTO venues (name, category, address, avg_service_minutes)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [v.name, v.category, v.address, v.avg],
          )
        ).rows[0].id;

      await client.query(
        `INSERT INTO users (email, password_hash, name, role, venue_id)
         VALUES ($1, $2, $3, 'STAFF', $4)
         ON CONFLICT (lower(email)) DO NOTHING`,
        [v.staff, hash, `${v.category} staff`, venueId],
      );
    }
    await client.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ('demo@antri.dev', $1, 'Demo Customer', 'CUSTOMER'),
              ('admin@antri.dev', $1, 'Antri Admin', 'ADMIN')
       ON CONFLICT (lower(email)) DO NOTHING`,
      [hash],
    );
    await client.query('COMMIT');
    log(
      `[seed] ${VENUES.length} venues, staff accounts, demo@antri.dev and admin@antri.dev ready (password: ${DEMO_PASSWORD})`,
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  seed().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
