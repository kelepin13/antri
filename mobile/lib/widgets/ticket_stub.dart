import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/models.dart';

/// The big paper ticket: venue, number, and a perforated tear line with the status.
class TicketStub extends StatelessWidget {
  const TicketStub({super.key, required this.ticket});

  final Ticket ticket;

  @override
  Widget build(BuildContext context) {
    final (label, color) = statusLabel(ticket);
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 24, offset: Offset(0, 8))],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
            child: Column(
              children: [
                Text(
                  ticket.venueName.toUpperCase(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(letterSpacing: 2, fontSize: 12, color: AntriColors.muted),
                ),
                const SizedBox(height: 8),
                Text('#${ticket.number}', key: const Key('ticket-number'), style: numberStyle.copyWith(fontSize: 88)),
              ],
            ),
          ),
          const _Perforation(),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// Human wording for a ticket's state, shared by the stub and lists.
(String, Color) statusLabel(Ticket t) => switch (t.status) {
      TicketStatus.waiting when (t.peopleAhead ?? 0) == 0 => ("You're next", AntriColors.teal),
      TicketStatus.waiting => ('${t.peopleAhead} ahead of you', AntriColors.ink),
      TicketStatus.called => ("It's your turn: go to ${t.counter ?? 'the counter'}", AntriColors.marigold),
      TicketStatus.served => ('Served. Thank you!', AntriColors.teal),
      TicketStatus.noShow => ('Skipped: you were not there in time', AntriColors.brick),
      TicketStatus.cancelled => ('Cancelled', AntriColors.muted),
    };

class _Perforation extends StatelessWidget {
  const _Perforation();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 20,
      child: Row(
        children: [
          const _Notch(left: true),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final dashes = (constraints.maxWidth / 10).floor();
                return Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: List.generate(
                    dashes,
                    (_) => Container(width: 5, height: 2, color: const Color(0xFFE5E0D6)),
                  ),
                );
              },
            ),
          ),
          const _Notch(left: false),
        ],
      ),
    );
  }
}

/// Half-circle cut-outs on both edges, filled with the page colour.
class _Notch extends StatelessWidget {
  const _Notch({required this.left});

  final bool left;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 10,
      height: 20,
      decoration: BoxDecoration(
        color: AntriColors.paper,
        borderRadius: left
            ? const BorderRadius.horizontal(right: Radius.circular(10))
            : const BorderRadius.horizontal(left: Radius.circular(10)),
      ),
    );
  }
}
