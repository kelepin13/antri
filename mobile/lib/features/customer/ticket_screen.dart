import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/realtime.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../widgets/common.dart';
import '../../widgets/ticket_stub.dart';

/// The customer's live ticket. Every queue change at the venue arrives over the
/// socket and triggers a refetch, so position and wait time update by themselves.
class TicketScreen extends ConsumerWidget {
  const TicketScreen({super.key, required this.ticketId, required this.venueId});

  final String ticketId;
  final String venueId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(venueLiveProvider(venueId), (_, __) => ref.invalidate(ticketProvider(ticketId)));
    ref.listen(ticketProvider(ticketId), (previous, next) {
      final was = previous?.value?.status;
      final now = next.value?.status;
      if (was != null && was != TicketStatus.called && now == TicketStatus.called) {
        HapticFeedback.heavyImpact();
      }
    });

    final ticket = ref.watch(ticketProvider(ticketId));
    return Scaffold(
      appBar: AppBar(title: const Text('Your ticket')),
      body: ticket.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(ticketProvider(ticketId))),
        data: (t) => RefreshIndicator(
          onRefresh: () => ref.refresh(ticketProvider(ticketId).future),
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              TicketStub(ticket: t),
              const SizedBox(height: 24),
              if (t.status == TicketStatus.waiting) _WaitingInfo(ticket: t),
              if (t.status == TicketStatus.called) const _CalledBanner(),
            ],
          ),
        ),
      ),
      bottomNavigationBar: switch (ticket.value) {
        Ticket t when t.status == TicketStatus.waiting => SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
              child: OutlinedButton(
                onPressed: () => _confirmCancel(context, ref, t),
                child: const Text('Leave the queue'),
              ),
            ),
          ),
        _ => null,
      },
    );
  }

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref, Ticket t) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Give up ticket #${t.number}?'),
        content: const Text('You will lose your place in the queue.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep it')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Leave')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await ref.read(repositoryProvider).cancel(t.id);
      if (context.mounted) ref.invalidate(ticketProvider(ticketId));
    } catch (e) {
      if (context.mounted) showError(context, e);
    }
  }
}

class _WaitingInfo extends StatelessWidget {
  const _WaitingInfo({required this.ticket});

  final Ticket ticket;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _Info(label: 'Ahead of you', value: '${ticket.peopleAhead ?? 0}')),
        Expanded(child: _Info(label: 'Estimated wait', value: formatMinutes(ticket.estimatedWaitMinutes ?? 0))),
      ],
    );
  }
}

class _Info extends StatelessWidget {
  const _Info({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: numberStyle.copyWith(fontSize: 32)),
        Text(label, style: const TextStyle(color: AntriColors.muted)),
      ],
    );
  }
}

class _CalledBanner extends StatelessWidget {
  const _CalledBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AntriColors.marigold.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Row(
        children: [
          Icon(Icons.campaign_rounded, color: AntriColors.marigold),
          SizedBox(width: 12),
          Expanded(child: Text('Please head to the counter now. You may be skipped if you don\'t arrive in time.')),
        ],
      ),
    );
  }
}
