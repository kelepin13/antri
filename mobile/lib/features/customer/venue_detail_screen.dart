import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/idempotency.dart';
import '../../core/realtime.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../widgets/common.dart';
import 'ticket_screen.dart';

class VenueDetailScreen extends ConsumerStatefulWidget {
  const VenueDetailScreen({super.key, required this.venueId, this.initial});

  final String venueId;
  final Venue? initial;

  @override
  ConsumerState<VenueDetailScreen> createState() => _VenueDetailScreenState();
}

class _VenueDetailScreenState extends ConsumerState<VenueDetailScreen> {
  bool _joining = false;

  /// Kept across retries of the same tap; cleared only after the server answered.
  String? _pendingKey;

  Future<void> _join() async {
    setState(() => _joining = true);
    _pendingKey ??= newIdempotencyKey();
    try {
      final ticket = await ref.read(repositoryProvider).join(widget.venueId, _pendingKey!);
      _pendingKey = null;
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(MaterialPageRoute<void>(
        builder: (_) => TicketScreen(ticketId: ticket.id, venueId: ticket.venueId),
      ));
    } catch (e) {
      final error = ApiException.from(e);
      // A network error means "unknown outcome": keep the key so a retry can't double-book.
      if (!error.isNetwork) _pendingKey = null;
      if (!mounted) return;
      if (error.code == 'ALREADY_IN_QUEUE' && error.data['ticketId'] is String) {
        await Navigator.of(context).pushReplacement(MaterialPageRoute<void>(
          builder: (_) => TicketScreen(ticketId: error.data['ticketId'] as String, venueId: widget.venueId),
        ));
        return;
      }
      showError(context, error);
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final live = ref.watch(venueLiveProvider(widget.venueId));
    final venue = live.value ?? widget.initial;

    return Scaffold(
      appBar: AppBar(title: Text(venue?.name ?? 'Venue')),
      body: venue == null
          ? (live.hasError
              ? ErrorView(error: live.error!, onRetry: () => ref.invalidate(venueLiveProvider(widget.venueId)))
              : const Center(child: CircularProgressIndicator()))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Row(children: [
                  Pill(venue.category),
                  const SizedBox(width: 6),
                  Pill(venue.isOpen ? 'Open' : 'Closed', color: venue.isOpen ? AntriColors.teal : AntriColors.brick),
                  const Spacer(),
                  if (live.hasValue) const _LiveDot(),
                ]),
                const SizedBox(height: 12),
                Text(venue.address, style: const TextStyle(color: AntriColors.muted)),
                const SizedBox(height: 24),
                Row(
                  children: [
                    _Stat(label: 'Waiting', value: '${venue.waitingCount}'),
                    _Stat(label: 'Est. wait', value: formatMinutes(venue.estimatedWaitMinutes)),
                    _Stat(label: 'Per customer', value: '${venue.avgServiceMinutes} min'),
                  ],
                ),
                const SizedBox(height: 24),
                const Text('Now serving', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                if (venue.nowServing.isEmpty)
                  const Text('Nobody yet', style: TextStyle(color: AntriColors.muted))
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final s in venue.nowServing)
                        Chip(label: Text('#${s.number}  ·  ${s.counter ?? ''}')),
                    ],
                  ),
              ],
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: FilledButton.icon(
            onPressed: (venue?.isOpen ?? false) && !_joining ? _join : null,
            icon: _joining
                ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.confirmation_number_rounded),
            label: Text(_pendingKey != null && !_joining ? 'Retry joining' : 'Take a number'),
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: numberStyle.copyWith(fontSize: 26)),
          Text(label, style: const TextStyle(color: AntriColors.muted, fontSize: 12)),
        ],
      ),
    );
  }
}

class _LiveDot extends StatelessWidget {
  const _LiveDot();

  @override
  Widget build(BuildContext context) {
    return const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.circle, size: 8, color: AntriColors.teal),
        SizedBox(width: 4),
        Text('Live', style: TextStyle(color: AntriColors.teal, fontSize: 12, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
