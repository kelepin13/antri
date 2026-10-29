/// Plain data classes mirroring the backend's JSON. Kept hand-written (no codegen)
/// so the project builds with nothing but `flutter pub get`.
library;

enum UserRole { customer, staff }

enum TicketStatus { waiting, called, served, noShow, cancelled }

TicketStatus _ticketStatus(String value) => switch (value) {
      'WAITING' => TicketStatus.waiting,
      'CALLED' => TicketStatus.called,
      'SERVED' => TicketStatus.served,
      'NO_SHOW' => TicketStatus.noShow,
      'CANCELLED' => TicketStatus.cancelled,
      _ => throw FormatException('Unknown ticket status $value'),
    };

DateTime? _date(Object? value) => value == null ? null : DateTime.parse(value as String).toLocal();

class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    this.venueId,
  });

  final String id;
  final String email;
  final String name;
  final UserRole role;
  final String? venueId;

  bool get isStaff => role == UserRole.staff;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        email: json['email'] as String,
        name: json['name'] as String,
        role: json['role'] == 'STAFF' ? UserRole.staff : UserRole.customer,
        venueId: json['venueId'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'name': name,
        'role': role == UserRole.staff ? 'STAFF' : 'CUSTOMER',
        'venueId': venueId,
      };
}

class AuthSession {
  const AuthSession({required this.token, required this.user});

  final String token;
  final AppUser user;

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
        token: json['accessToken'] as String,
        user: AppUser.fromJson(json['user'] as Map<String, dynamic>),
      );

  Map<String, dynamic> toJson() => {'accessToken': token, 'user': user.toJson()};
}

class ServingItem {
  const ServingItem({required this.number, this.counter});

  final int number;
  final String? counter;

  factory ServingItem.fromJson(Map<String, dynamic> json) =>
      ServingItem(number: json['number'] as int, counter: json['counter'] as String?);
}

/// A venue plus its live queue state. Pushed over the socket as `queue.updated`.
class Venue {
  const Venue({
    required this.id,
    required this.name,
    required this.category,
    required this.address,
    required this.isOpen,
    required this.waitingCount,
    required this.lastIssuedNumber,
    required this.nowServing,
    required this.avgServiceMinutes,
    required this.estimatedWaitMinutes,
  });

  final String id;
  final String name;
  final String category;
  final String address;
  final bool isOpen;
  final int waitingCount;
  final int lastIssuedNumber;
  final List<ServingItem> nowServing;
  final int avgServiceMinutes;
  final int estimatedWaitMinutes;

  factory Venue.fromJson(Map<String, dynamic> json) => Venue(
        id: json['id'] as String,
        name: json['name'] as String,
        category: json['category'] as String,
        address: json['address'] as String,
        isOpen: json['isOpen'] as bool,
        waitingCount: json['waitingCount'] as int,
        lastIssuedNumber: json['lastIssuedNumber'] as int,
        nowServing: (json['nowServing'] as List)
            .map((e) => ServingItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        avgServiceMinutes: json['avgServiceMinutes'] as int,
        estimatedWaitMinutes: json['estimatedWaitMinutes'] as int,
      );
}

class Ticket {
  const Ticket({
    required this.id,
    required this.venueId,
    required this.venueName,
    required this.number,
    required this.status,
    required this.createdAt,
    this.counter,
    this.peopleAhead,
    this.estimatedWaitMinutes,
    this.calledAt,
    this.finishedAt,
  });

  final String id;
  final String venueId;
  final String venueName;
  final int number;
  final TicketStatus status;
  final String? counter;
  final int? peopleAhead;
  final int? estimatedWaitMinutes;
  final DateTime createdAt;
  final DateTime? calledAt;
  final DateTime? finishedAt;

  bool get isActive => status == TicketStatus.waiting || status == TicketStatus.called;

  factory Ticket.fromJson(Map<String, dynamic> json) => Ticket(
        id: json['id'] as String,
        venueId: json['venueId'] as String,
        venueName: json['venueName'] as String,
        number: json['number'] as int,
        status: _ticketStatus(json['status'] as String),
        counter: json['counter'] as String?,
        peopleAhead: json['peopleAhead'] as int?,
        estimatedWaitMinutes: json['estimatedWaitMinutes'] as int?,
        createdAt: _date(json['createdAt'])!,
        calledAt: _date(json['calledAt']),
        finishedAt: _date(json['finishedAt']),
      );
}

class QueueEntry {
  const QueueEntry({required this.id, required this.number, required this.customerName, this.counter});

  final String id;
  final int number;
  final String customerName;
  final String? counter;

  factory QueueEntry.fromJson(Map<String, dynamic> json) => QueueEntry(
        id: json['id'] as String,
        number: json['number'] as int,
        customerName: json['customerName'] as String,
        counter: json['counter'] as String?,
      );
}

/// Everything the staff console shows.
class StaffQueue {
  const StaffQueue({required this.venue, required this.called, required this.waiting});

  final Venue venue;
  final List<QueueEntry> called;
  final List<QueueEntry> waiting;

  factory StaffQueue.fromJson(Map<String, dynamic> json) => StaffQueue(
        venue: Venue.fromJson(json['venue'] as Map<String, dynamic>),
        called: (json['called'] as List).map((e) => QueueEntry.fromJson(e as Map<String, dynamic>)).toList(),
        waiting: (json['waiting'] as List).map((e) => QueueEntry.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.ticketId,
    required this.type,
    required this.message,
    required this.read,
    required this.createdAt,
  });

  final String id;
  final String ticketId;
  final String type;
  final String message;
  final bool read;
  final DateTime createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: json['id'] as String,
        ticketId: json['ticketId'] as String,
        type: json['type'] as String,
        message: json['message'] as String,
        read: json['read'] as bool,
        createdAt: _date(json['createdAt'])!,
      );
}
