import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import 'api_client.dart';

/// Every backend call the app makes, in one place.
class AntriRepository {
  AntriRepository(this._dio);

  final Dio _dio;

  Future<List<Venue>> venues() async {
    final list = await _dio.getJson<List<dynamic>>('/venues');
    return list.map((e) => Venue.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Venue> venue(String id) async => Venue.fromJson(await _dio.getJson<Map<String, dynamic>>('/venues/$id'));

  /// Send the same [idempotencyKey] when retrying the same tap.
  Future<Ticket> join(String venueId, String idempotencyKey) async => Ticket.fromJson(
        await _dio.postJson<Map<String, dynamic>>(
          '/venues/$venueId/tickets',
          headers: {'Idempotency-Key': idempotencyKey},
        ),
      );

  Future<List<Ticket>> myTickets() async {
    final list = await _dio.getJson<List<dynamic>>('/tickets/me');
    return list.map((e) => Ticket.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Ticket> ticket(String id) async => Ticket.fromJson(await _dio.getJson<Map<String, dynamic>>('/tickets/$id'));

  Future<Ticket> cancel(String id) async =>
      Ticket.fromJson(await _dio.postJson<Map<String, dynamic>>('/tickets/$id/cancel'));

  Future<List<AppNotification>> notifications() async {
    final list = await _dio.getJson<List<dynamic>>('/notifications/me');
    return list.map((e) => AppNotification.fromJson(e as Map<String, dynamic>)).toList();
  }

  // ---- Staff ----

  Future<StaffQueue> staffQueue() async =>
      StaffQueue.fromJson(await _dio.getJson<Map<String, dynamic>>('/staff/queue'));

  /// Returns the newly called ticket, or null when nobody is waiting.
  Future<Ticket?> callNext(String counter) async {
    final json = await _dio.postJson<Map<String, dynamic>>('/staff/call-next', body: {'counter': counter});
    final ticket = json['ticket'];
    return ticket == null ? null : Ticket.fromJson(ticket as Map<String, dynamic>);
  }

  Future<void> finish(String ticketId, {required bool served}) =>
      _dio.postJson<dynamic>('/staff/tickets/$ticketId/finish', body: {'outcome': served ? 'SERVED' : 'NO_SHOW'});

  Future<void> setOpen(bool isOpen) => _dio.patchJson<dynamic>('/staff/venue', body: {'isOpen': isOpen});
}

final repositoryProvider = Provider<AntriRepository>((ref) => AntriRepository(ref.watch(dioProvider)));

final venuesProvider = FutureProvider.autoDispose<List<Venue>>((ref) => ref.watch(repositoryProvider).venues());

final myTicketsProvider = FutureProvider.autoDispose<List<Ticket>>((ref) => ref.watch(repositoryProvider).myTickets());

final ticketProvider =
    FutureProvider.autoDispose.family<Ticket, String>((ref, id) => ref.watch(repositoryProvider).ticket(id));

final notificationsProvider =
    FutureProvider.autoDispose<List<AppNotification>>((ref) => ref.watch(repositoryProvider).notifications());

final staffQueueProvider = FutureProvider.autoDispose<StaffQueue>((ref) => ref.watch(repositoryProvider).staffQueue());
