import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { config, VENUE_CHANGED_CHANNEL } from '../config';
import { VenuesService } from '../venues/venues.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const room = (venueId: string) => `venue:${venueId}`;

/**
 * Live queue updates.
 *
 * Clients send `venue.join` with a venue id and then receive `queue.updated` snapshots
 * for that venue. Changes arrive over Redis pub/sub, so it does not matter which API
 * instance (or the worker) made the change.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class QueueGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(QueueGateway.name);
  private readonly subscriber = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

  constructor(private readonly venues: VenuesService) {}

  async onModuleInit() {
    await this.subscriber.subscribe(VENUE_CHANGED_CHANNEL);
    this.subscriber.on('message', (_channel, venueId: string) => {
      void this.broadcast(venueId);
    });
  }

  @SubscribeMessage('venue.join')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() venueId: string) {
    if (typeof venueId !== 'string' || !UUID.test(venueId)) return { ok: false, error: 'invalid venue id' };
    await socket.join(room(venueId));
    // Send the current state right away so the client never shows stale data.
    socket.emit('queue.updated', await this.venues.snapshot(venueId).catch(() => null));
    return { ok: true };
  }

  @SubscribeMessage('venue.leave')
  async leave(@ConnectedSocket() socket: Socket, @MessageBody() venueId: string) {
    if (typeof venueId === 'string') await socket.leave(room(venueId));
    return { ok: true };
  }

  private async broadcast(venueId: string) {
    // Skip the query when nobody on this instance is watching the venue.
    if (!this.server?.sockets.adapter.rooms.get(room(venueId))?.size) return;
    try {
      this.server.to(room(venueId)).emit('queue.updated', await this.venues.snapshot(venueId));
    } catch (error) {
      this.logger.warn(`broadcast for ${venueId} failed: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.subscriber.quit().catch(() => undefined);
  }
}
