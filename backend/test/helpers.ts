import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { migrate } from '../src/db/migrate';

export async function resetDatabase() {
  await migrate(process.env.DATABASE_URL, () => undefined);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('TRUNCATE notifications, tickets, users, venues CASCADE');
  await client.end();
}

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = setupApp(moduleRef.createNestApplication({ logger: ['error'] }));
  // Listening once lets supertest reuse one server instead of binding a port per request.
  await app.listen(0);
  return app;
}

const PASSWORD_HASH = bcrypt.hashSync('password123', 4);

export async function createVenue(name = `Venue ${randomUUID().slice(0, 6)}`): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `INSERT INTO venues (name, category, address, notify_ahead) VALUES ($1, 'Test', 'Somewhere', 3) RETURNING id`,
    [name],
  );
  return row.id;
}

async function createUser(role: 'CUSTOMER' | 'STAFF' | 'ADMIN', venueId: string | null) {
  const email = `${role.toLowerCase()}-${randomUUID()}@test.dev`;
  await sql(
    `INSERT INTO users (email, password_hash, name, role, venue_id) VALUES ($1, $2, $3, $4, $5)`,
    [email, PASSWORD_HASH, `${role} ${email.slice(0, 12)}`, role, venueId],
  );
  return email;
}

export async function login(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password123' }).expect(200);
  return res.body.accessToken;
}

export async function customerToken(app: INestApplication) {
  return login(app, await createUser('CUSTOMER', null));
}

export async function adminToken(app: INestApplication) {
  return login(app, await createUser('ADMIN', null));
}

export async function staffToken(app: INestApplication, venueId: string) {
  return login(app, await createUser('STAFF', venueId));
}

export function join(app: INestApplication, token: string, venueId: string, key: string = randomUUID()) {
  return request(app.getHttpServer())
    .post(`/venues/${venueId}/tickets`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key);
}

export function callNext(app: INestApplication, token: string, counter: string, completePrevious = true) {
  return request(app.getHttpServer())
    .post('/staff/call-next')
    .set('Authorization', `Bearer ${token}`)
    .send({ counter, completePrevious });
}
