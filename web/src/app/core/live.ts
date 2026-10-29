import { Injectable, OnDestroy } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { VenueSnapshot } from './models';

/**
 * Live queue snapshots over Socket.io. One connection for the whole app; each
 * subscription joins a venue's room and re-joins after a reconnect, so screens
 * left open all day (the display, a staff counter) recover on their own.
 */
@Injectable({ providedIn: 'root' })
export class LiveQueue implements OnDestroy {
  private socket?: Socket;

  private connection(): Socket {
    // Same origin: the dev proxy and nginx both forward /socket.io to the API.
    this.socket ??= io({ transports: ['websocket'] });
    return this.socket;
  }

  watch(venueId: string): Observable<VenueSnapshot> {
    return new Observable<VenueSnapshot>((subscriber) => {
      const socket = this.connection();
      const onUpdate = (snapshot: VenueSnapshot | null) => {
        if (snapshot?.id === venueId) subscriber.next(snapshot);
      };
      const join = () => socket.emit('venue.join', venueId);

      socket.on('queue.updated', onUpdate);
      socket.on('connect', join);
      if (socket.connected) join();

      return () => {
        socket.off('queue.updated', onUpdate);
        socket.off('connect', join);
        if (socket.connected) socket.emit('venue.leave', venueId);
      };
    });
  }

  /** True while the socket is connected; screens show a quiet "reconnecting" hint otherwise. */
  onConnectionChange(listener: (connected: boolean) => void): () => void {
    const socket = this.connection();
    const up = () => listener(true);
    const down = () => listener(false);
    socket.on('connect', up);
    socket.on('disconnect', down);
    listener(socket.connected);
    return () => {
      socket.off('connect', up);
      socket.off('disconnect', down);
    };
  }

  ngOnDestroy() {
    this.socket?.disconnect();
  }
}
