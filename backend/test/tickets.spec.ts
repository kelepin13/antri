import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { callNext, createApp, createVenue, customerToken, join, resetDatabase, sql, staffToken } from './helpers';

describe('Tickets (real Postgres)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetDatabase();
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues gap-free, unique numbers when 40 customers join at the same moment', async () => {
    const venueId = await createVenue();
    const tokens = await Promise.all(Array.from({ length: 40 }, () => customerToken(app)));

    const responses = await Promise.all(tokens.map((t) => join(app, t, venueId)));

    expect(responses.every((r) => r.status === 201)).toBe(true);
    const numbers = responses.map((r) => r.body.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it('returns the original ticket when a request is retried with the same Idempotency-Key', async () => {
    const venueId = await createVenue();
    const token = await customerToken(app);

    const first = await join(app, token, venueId, 'retry-key-0001').expect(201);
    const retry = await join(app, token, venueId, 'retry-key-0001').expect(200);

    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.id).toBe(first.body.id);
  });

  it('creates exactly one ticket when the same request is fired 10 times in parallel', async () => {
    const venueId = await createVenue();
    const token = await customerToken(app);

    const responses = await Promise.all(Array.from({ length: 10 }, () => join(app, token, venueId, 'double-tap-0001')));

    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 200)).toHaveLength(9);
    const [{ count }] = await sql<{ count: number }>('SELECT count(*)::int AS count FROM tickets WHERE venue_id = $1', [
      venueId,
    ]);
    expect(count).toBe(1);
  });

  it('rejects an Idempotency-Key that is reused for a different venue', async () => {
    const [venueA, venueB] = await Promise.all([createVenue(), createVenue()]);
    const token = await customerToken(app);

    await join(app, token, venueA, 'reused-key-0001').expect(201);
    const res = await join(app, token, venueB, 'reused-key-0001').expect(422);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('allows one active ticket per customer per venue', async () => {
    const venueId = await createVenue();
    const token = await customerToken(app);

    const first = await join(app, token, venueId).expect(201);
    const second = await join(app, token, venueId).expect(409);
    expect(second.body).toMatchObject({ code: 'ALREADY_IN_QUEUE', ticketId: first.body.id });
  });

  it('never gives the same ticket to two counters calling at the same time', async () => {
    const venueId = await createVenue();
    const customers = await Promise.all(Array.from({ length: 10 }, () => customerToken(app)));
    for (const t of customers) await join(app, t, venueId).expect(201);
    const staff = await staffToken(app, venueId);

    const calls = await Promise.all(
      ['A', 'B', 'C', 'D', 'E'].map((c) => callNext(app, staff, `Counter ${c}`, false).expect(200)),
    );

    const called = calls.map((r) => r.body.ticket.number).sort((a, b) => a - b);
    expect(called).toEqual([1, 2, 3, 4, 5]);
    const [{ count }] = await sql<{ count: number }>(
      `SELECT count(*)::int AS count FROM tickets WHERE venue_id = $1 AND status = 'CALLED'`,
      [venueId],
    );
    expect(count).toBe(5);
  });

  it('serves the previous customer automatically when a counter calls the next one', async () => {
    const venueId = await createVenue();
    const [a, b] = await Promise.all([customerToken(app), customerToken(app)]);
    const ticketA = (await join(app, a, venueId).expect(201)).body;
    await join(app, b, venueId).expect(201);
    const staff = await staffToken(app, venueId);

    await callNext(app, staff, 'Counter 1').expect(200);
    const second = await callNext(app, staff, 'Counter 1').expect(200);

    expect(second.body.completedTicketIds).toEqual([ticketA.id]);
    expect(second.body.ticket.number).toBe(2);
    const [row] = await sql<{ status: string }>('SELECT status FROM tickets WHERE id = $1', [ticketA.id]);
    expect(row.status).toBe('SERVED');
  });

  it('enforces the ticket state machine', async () => {
    const venueId = await createVenue();
    const otherVenueId = await createVenue();
    const customer = await customerToken(app);
    const ticket = (await join(app, customer, venueId).expect(201)).body;
    const staff = await staffToken(app, venueId);
    const otherStaff = await staffToken(app, otherVenueId);
    const server = app.getHttpServer();

    // WAITING -> SERVED is not allowed: the ticket has to be called first.
    const early = await request(server)
      .post(`/staff/tickets/${ticket.id}/finish`)
      .set('Authorization', `Bearer ${staff}`)
      .send({ outcome: 'SERVED' })
      .expect(409);
    expect(early.body).toMatchObject({ code: 'INVALID_TRANSITION', status: 'WAITING' });

    // Staff from another venue cannot even see it.
    await request(server)
      .post(`/staff/tickets/${ticket.id}/finish`)
      .set('Authorization', `Bearer ${otherStaff}`)
      .send({ outcome: 'SERVED' })
      .expect(404);

    await callNext(app, staff, 'Counter 1').expect(200);

    // A called ticket can no longer be cancelled by the customer.
    const cancel = await request(server)
      .post(`/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${customer}`)
      .expect(409);
    expect(cancel.body.code).toBe('INVALID_TRANSITION');

    const served = await request(server)
      .post(`/staff/tickets/${ticket.id}/finish`)
      .set('Authorization', `Bearer ${staff}`)
      .send({ outcome: 'SERVED' })
      .expect(200);
    expect(served.body.status).toBe('SERVED');
  });

  it('reports queue position and lets a waiting customer leave', async () => {
    const venueId = await createVenue();
    const [a, b, c] = await Promise.all([customerToken(app), customerToken(app), customerToken(app)]);
    await join(app, a, venueId).expect(201);
    const ticketB = (await join(app, b, venueId).expect(201)).body;
    const ticketC = (await join(app, c, venueId).expect(201)).body;
    expect(ticketC.peopleAhead).toBe(2);

    await request(app.getHttpServer()).post(`/tickets/${ticketB.id}/cancel`).set('Authorization', `Bearer ${b}`).expect(200);

    const refreshed = await request(app.getHttpServer())
      .get(`/tickets/${ticketC.id}`)
      .set('Authorization', `Bearer ${c}`)
      .expect(200);
    expect(refreshed.body.peopleAhead).toBe(1);

    // Another customer cannot read someone else's ticket.
    await request(app.getHttpServer()).get(`/tickets/${ticketC.id}`).set('Authorization', `Bearer ${a}`).expect(404);
  });

  it('requires authentication and the right role', async () => {
    const venueId = await createVenue();
    const server = app.getHttpServer();
    await request(server).post(`/venues/${venueId}/tickets`).set('Idempotency-Key', 'no-auth-0001').expect(401);

    const customer = await customerToken(app);
    const res = await callNext(app, customer, 'Counter 1').expect(403);
    expect(res.body.code).toBe('FORBIDDEN');

    const missingKey = await request(server)
      .post(`/venues/${venueId}/tickets`)
      .set('Authorization', `Bearer ${customer}`)
      .expect(400);
    expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});
