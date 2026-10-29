import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../src/db/database.module';
import { NotificationsProcessor } from '../src/jobs/notifications.processor';
import { PushSender } from '../src/jobs/push.sender';
import { RedisModule } from '../src/realtime/redis.module';
import { callNext, createApp, createVenue, customerToken, join, resetDatabase, sql, staffToken } from './helpers';

describe('Background jobs', () => {
  let app: INestApplication;
  let worker: TestingModule;
  let processor: NotificationsProcessor;
  const sent: string[] = [];

  beforeAll(async () => {
    await resetDatabase();
    app = await createApp();
    worker = await Test.createTestingModule({
      imports: [DatabaseModule, RedisModule],
      providers: [NotificationsProcessor, PushSender],
    })
      .overrideProvider(PushSender)
      .useValue({ send: async (messages: { message: string }[]) => sent.push(...messages.map((m) => m.message)) })
      .compile();
    processor = worker.get(NotificationsProcessor);
  });

  afterAll(async () => {
    await worker.close();
    await app.close();
  });

  it('notifies the next customers once, even when the job runs again (retry-safe)', async () => {
    const venueId = await createVenue();
    for (let i = 0; i < 5; i++) await join(app, await customerToken(app), venueId).expect(201);

    const first = await processor.checkUpcoming(venueId);
    const retry = await processor.checkUpcoming(venueId);

    expect(first).toHaveLength(3); // venue.notify_ahead = 3
    expect(retry).toHaveLength(0);
    const rows = await sql<{ number: number }>(
      `SELECT t.number FROM notifications n JOIN tickets t ON t.id = n.ticket_id
       WHERE t.venue_id = $1 AND n.type = 'ALMOST_UP' ORDER BY t.number`,
      [venueId],
    );
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3]);
  });

  it('marks stale called tickets as no-show and expires tickets from previous days', async () => {
    const venueId = await createVenue();
    const [a, b] = await Promise.all([customerToken(app), customerToken(app)]);
    const called = (await join(app, a, venueId).expect(201)).body;
    const old = (await join(app, b, venueId).expect(201)).body;
    await callNext(app, await staffToken(app, venueId), 'Counter 1').expect(200);

    await sql(`UPDATE tickets SET called_at = now() - interval '1 hour' WHERE id = $1`, [called.id]);
    await sql(`UPDATE tickets SET service_date = service_date - 1 WHERE id = $1`, [old.id]);

    await processor.sweep();
    const again = await processor.sweep();

    const statuses = await sql<{ id: string; status: string }>('SELECT id, status FROM tickets WHERE venue_id = $1', [
      venueId,
    ]);
    expect(Object.fromEntries(statuses.map((s) => [s.id, s.status]))).toEqual({
      [called.id]: 'NO_SHOW',
      [old.id]: 'CANCELLED',
    });
    expect(again).toEqual({ noShows: 0, expired: 0 });
    const [{ count }] = await sql<{ count: number }>(
      `SELECT count(*)::int AS count FROM notifications WHERE ticket_id = $1 AND type = 'NO_SHOW'`,
      [called.id],
    );
    expect(count).toBe(1);
  });
});
