import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../models/models.dart';
import 'config.dart';

/// One socket for the whole app, reconnecting on its own.
final socketProvider = Provider<io.Socket>((ref) {
  final socket = io.io(
    apiUrl,
    io.OptionBuilder().setTransports(['websocket']).disableAutoConnect().build(),
  );
  socket.connect();
  ref.onDispose(socket.dispose);
  return socket;
});

/// Live snapshots for one venue. The server sends the current state as soon as we
/// join the venue's room, then a new snapshot after every change. The room is
/// re-joined after a reconnect, so a flaky network never leaves the screen stale.
final venueLiveProvider = StreamProvider.autoDispose.family<Venue, String>((ref, venueId) {
  final socket = ref.watch(socketProvider);
  final controller = StreamController<Venue>();

  void onUpdate(dynamic data) {
    if (data is Map && data['id'] == venueId) {
      controller.add(Venue.fromJson(Map<String, dynamic>.from(data)));
    }
  }

  void joinRoom([dynamic _]) => socket.emit('venue.join', venueId);

  socket.on('queue.updated', onUpdate);
  socket.on('connect', joinRoom);
  if (socket.connected) joinRoom();

  ref.onDispose(() {
    socket.off('queue.updated', onUpdate);
    socket.off('connect', joinRoom);
    if (socket.connected) socket.emit('venue.leave', venueId);
    controller.close();
  });
  return controller.stream;
});
