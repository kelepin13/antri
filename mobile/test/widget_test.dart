import 'package:antri/models/models.dart';
import 'package:antri/widgets/ticket_stub.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> ticketJson({String status = 'WAITING', int? peopleAhead = 2, String? counter}) => {
      'id': 't1',
      'venueId': 'v1',
      'venueName': 'Klinik Sehat Bersama',
      'number': 7,
      'status': status,
      'counter': counter,
      'serviceDate': '2026-10-28',
      'peopleAhead': peopleAhead,
      'estimatedWaitMinutes': peopleAhead == null ? null : peopleAhead * 8,
      'createdAt': '2026-10-28T02:41:51.883Z',
      'calledAt': null,
      'finishedAt': null,
    };

void main() {
  group('JSON parsing (matches the backend response shape)', () {
    test('parses a waiting ticket', () {
      final t = Ticket.fromJson(ticketJson());
      expect(t.number, 7);
      expect(t.status, TicketStatus.waiting);
      expect(t.peopleAhead, 2);
      expect(t.isActive, isTrue);
    });

    test('parses a venue snapshot', () {
      final v = Venue.fromJson({
        'id': 'v1',
        'name': 'Klinik Sehat Bersama',
        'category': 'Clinic',
        'address': 'Jl. Melati No. 12',
        'isOpen': true,
        'waitingCount': 3,
        'lastIssuedNumber': 9,
        'nowServing': [
          {'number': 6, 'counter': 'Counter 1'},
        ],
        'avgServiceMinutes': 8,
        'estimatedWaitMinutes': 24,
        'updatedAt': '2026-10-28T02:41:42.482Z',
      });
      expect(v.nowServing.single.counter, 'Counter 1');
      expect(v.estimatedWaitMinutes, 24);
    });

    test('rejects an unknown ticket status', () {
      expect(() => Ticket.fromJson(ticketJson(status: 'LOST')), throwsFormatException);
    });
  });

  testWidgets('ticket stub tells a called customer where to go', (tester) async {
    final ticket = Ticket.fromJson(ticketJson(status: 'CALLED', peopleAhead: null, counter: 'Counter 2'));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: TicketStub(ticket: ticket))));

    expect(find.text('#7'), findsOneWidget);
    expect(find.textContaining('Counter 2'), findsOneWidget);
  });
}
