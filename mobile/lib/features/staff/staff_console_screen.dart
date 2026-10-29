import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/realtime.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../widgets/common.dart';
import '../auth/auth_controller.dart';

const _counters = ['Counter 1', 'Counter 2', 'Counter 3'];

/// For venue staff: call the next number, mark served / no-show, open or close the queue.
class StaffConsoleScreen extends ConsumerStatefulWidget {
  const StaffConsoleScreen({super.key});

  @override
  ConsumerState<StaffConsoleScreen> createState() => _StaffConsoleScreenState();
}

class _StaffConsoleScreenState extends ConsumerState<StaffConsoleScreen> {
  String _counter = _counters.first;
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) ref.invalidate(staffQueueProvider);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _callNext() => _run(() async {
        final called = await ref.read(repositoryProvider).callNext(_counter);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text(called == null ? 'Nobody is waiting.' : 'Calling #${called.number} to $_counter'),
        ));
      });

  @override
  Widget build(BuildContext context) {
    final venueId = ref.watch(authControllerProvider).value?.user.venueId;
    // Any change at this venue (customers joining, other counters calling) refreshes the console.
    if (venueId != null) {
      ref.listen(venueLiveProvider(venueId), (_, __) => ref.invalidate(staffQueueProvider));
    }
    final queue = ref.watch(staffQueueProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(queue.value?.venue.name ?? 'Staff console'),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: queue.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(staffQueueProvider)),
        data: (q) => RefreshIndicator(
          onRefresh: () => ref.refresh(staffQueueProvider.future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Accepting new tickets'),
                subtitle: Text('${q.venue.waitingCount} waiting · last issued #${q.venue.lastIssuedNumber}'),
                value: q.venue.isOpen,
                onChanged: _busy ? null : (open) => _run(() => ref.read(repositoryProvider).setOpen(open)),
              ),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: [for (final c in _counters) ButtonSegment(value: c, label: Text(c))],
                selected: {_counter},
                onSelectionChanged: (s) => setState(() => _counter = s.first),
              ),
              const SizedBox(height: 16),
              _CurrentAtCounter(
                entry: q.called.where((e) => e.counter == _counter).firstOrNull,
                busy: _busy,
                onFinish: (entry, served) =>
                    _run(() => ref.read(repositoryProvider).finish(entry.id, served: served)),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _busy ? null : _callNext,
                icon: const Icon(Icons.campaign_rounded),
                label: Text('Call next to $_counter'),
              ),
              const SizedBox(height: 28),
              if (q.called.any((e) => e.counter != _counter)) ...[
                const Text('Other counters', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                for (final e in q.called.where((e) => e.counter != _counter))
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Text('#${e.number}', style: numberStyle.copyWith(fontSize: 20)),
                    title: Text(e.customerName),
                    trailing: Text(e.counter ?? ''),
                  ),
                const SizedBox(height: 16),
              ],
              Text('Waiting (${q.waiting.length})', style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              if (q.waiting.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Text('The queue is empty.', style: TextStyle(color: AntriColors.muted)),
                ),
              for (final e in q.waiting)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Text('#${e.number}', style: numberStyle.copyWith(fontSize: 20)),
                  title: Text(e.customerName),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CurrentAtCounter extends StatelessWidget {
  const _CurrentAtCounter({required this.entry, required this.busy, required this.onFinish});

  final QueueEntry? entry;
  final bool busy;
  final void Function(QueueEntry entry, bool served) onFinish;

  @override
  Widget build(BuildContext context) {
    final e = entry;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
      child: e == null
          ? const Text('No one at this counter. Call the next number.', style: TextStyle(color: AntriColors.muted))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('NOW SERVING', style: TextStyle(letterSpacing: 2, fontSize: 12, color: AntriColors.muted)),
                Text('#${e.number}', style: numberStyle.copyWith(fontSize: 56)),
                Text(e.customerName, style: const TextStyle(fontSize: 16)),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: busy ? null : () => onFinish(e, false),
                        child: const Text('No-show'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: busy ? null : () => onFinish(e, true),
                        child: const Text('Served'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
    );
  }
}
