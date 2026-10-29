import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { adminToken, callNext, createApp, createVenue, customerToken, join, login, resetDatabase, staffToken } from './helpers';

describe('Admin (venues, staff, overview)', () => {
  let app: INestApplication;
  let admin: string;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    await resetDatabase();
    app = await createApp();
    admin = await adminToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('is only available to admins', async () => {
    const venueId = await createVenue();
    for (const token of [await customerToken(app), await staffToken(app, venueId)]) {
      await api().get('/admin/overview').set('Authorization', `Bearer ${token}`).expect(403);
    }
  });

  it('creates venues and rejects duplicates and unknown time zones', async () => {
    const created = await api()
      .post('/admin/venues')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Klinik Pratama Harapan', category: 'Clinic', address: 'Jl. Mawar 3', avgServiceMinutes: 10 })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Klinik Pratama Harapan', isOpen: true, avgServiceMinutes: 10 });

    const duplicate = await api()
      .post('/admin/venues')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'klinik pratama harapan', category: 'Clinic', address: 'Elsewhere' })
      .expect(409);
    expect(duplicate.body.code).toBe('VENUE_NAME_TAKEN');

    const badZone = await api()
      .post('/admin/venues')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Somewhere New', category: 'Clinic', address: 'Jl. 1', timezone: 'Mars/Olympus' })
      .expect(400);
    expect(badZone.body.code).toBe('INVALID_TIMEZONE');
  });

  it('creates a staff account that can run its venue, and removes it', async () => {
    const venueId = await createVenue();
    const created = await api()
      .post('/admin/staff')
      .set('Authorization', `Bearer ${admin}`)
      .send({ email: 'rina@klinik.test', name: 'Rina', password: 'password123', venueId })
      .expect(201);
    expect(created.body).toMatchObject({ email: 'rina@klinik.test', venueId });

    const staff = await login(app, 'rina@klinik.test');
    const queue = await api().get('/staff/queue').set('Authorization', `Bearer ${staff}`).expect(200);
    expect(queue.body.venue.id).toBe(venueId);

    await api().delete(`/admin/staff/${created.body.id}`).set('Authorization', `Bearer ${admin}`).expect(204);
    await api().post('/auth/login').send({ email: 'rina@klinik.test', password: 'password123' }).expect(401);
  });

  it("reports today's numbers per venue", async () => {
    const venueId = await createVenue();
    await join(app, await customerToken(app), venueId).expect(201);
    await join(app, await customerToken(app), venueId).expect(201);
    await callNext(app, await staffToken(app, venueId), 'Counter 1').expect(200);

    const res = await api().get('/admin/overview').set('Authorization', `Bearer ${admin}`).expect(200);
    const venue = res.body.find((v: { id: string }) => v.id === venueId);

    expect(venue.today).toMatchObject({ issued: 2, served: 0, noShow: 0, cancelled: 0, avgWaitMinutes: 0 });
    expect(venue.today.ticketsPerHour).toHaveLength(24);
    expect(venue.today.ticketsPerHour.reduce((a: number, b: number) => a + b, 0)).toBe(2);
    expect(venue.staffCount).toBe(1);
    expect(venue).toMatchObject({ timezone: 'Asia/Jakarta', notifyAhead: 3, configuredServiceMinutes: 5 });
    expect(venue.waitingCount).toBe(1);
  });

  it('closing a venue stops new tickets', async () => {
    const venueId = await createVenue();
    const updated = await api()
      .patch(`/admin/venues/${venueId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ isOpen: false })
      .expect(200);
    expect(updated.body.isOpen).toBe(false);

    const res = await join(app, await customerToken(app), venueId).expect(409);
    expect(res.body.code).toBe('VENUE_CLOSED');
  });
});
