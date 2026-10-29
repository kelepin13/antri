import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import { createApp, createVenue, customerToken, join, resetDatabase } from './helpers';

describe('Live queue updates (Socket.io)', () => {
  let app: INestApplication;
  let socket: Socket;

  beforeAll(async () => {
    await resetDatabase();
    app = await createApp();
  });

  afterAll(async () => {
    socket?.disconnect();
    await app.close();
  });

  it('pushes a fresh snapshot to watchers when someone joins the queue', async () => {
    const venueId = await createVenue();
    const { port } = app.getHttpServer().address() as AddressInfo;
    socket = io(`http://localhost:${port}`, { transports: ['websocket'] });

    const snapshots: { waitingCount: number }[] = [];
    socket.on('queue.updated', (s) => snapshots.push(s));
    const ack = await socket.emitWithAck('venue.join', venueId);
    expect(ack).toEqual({ ok: true });

    const updated = new Promise<{ waitingCount: number; lastIssuedNumber: number }>((resolve) =>
      socket.on('queue.updated', (s) => s.waitingCount === 1 && resolve(s)),
    );
    await join(app, await customerToken(app), venueId).expect(201);

    await expect(updated).resolves.toMatchObject({ waitingCount: 1, lastIssuedNumber: 1 });
    expect(snapshots[0]).toMatchObject({ waitingCount: 0 }); // initial state sent on join
  });
});
