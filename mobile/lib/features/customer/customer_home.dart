import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/repository.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../widgets/common.dart';
import '../../widgets/ticket_stub.dart';
import '../auth/auth_controller.dart';
import 'ticket_screen.dart';
import 'venue_detail_screen.dart';

class CustomerHome extends StatefulWidget {
  const CustomerHome({super.key});

  @override
  State<CustomerHome> createState() => _CustomerHomeState();
}

class _CustomerHomeState extends State<CustomerHome> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(
          index: _tab,
          children: const [_VenuesTab(), _MyTicketsTab(), _AlertsTab()],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.storefront_outlined), label: 'Venues'),
          NavigationDestination(icon: Icon(Icons.confirmation_number_outlined), label: 'My tickets'),
          NavigationDestination(icon: Icon(Icons.notifications_none_rounded), label: 'Alerts'),
        ],
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header(this.title);

  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 8, 8),
      child: Row(
        children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800))),
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
    );
  }
}

class _VenuesTab extends ConsumerWidget {
  const _VenuesTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final venues = ref.watch(venuesProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Header('Where to?'),
        Expanded(
          child: venues.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(venuesProvider)),
            data: (list) => RefreshIndicator(
              onRefresh: () => ref.refresh(venuesProvider.future),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, i) => _VenueCard(venue: list[i]),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _VenueCard extends StatelessWidget {
  const _VenueCard({required this.venue});

  final Venue venue;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => VenueDetailScreen(venueId: venue.id, initial: venue)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Pill(venue.category),
                      const SizedBox(width: 6),
                      if (!venue.isOpen) const Pill('Closed', color: AntriColors.brick),
                    ]),
                    const SizedBox(height: 8),
                    Text(venue.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(venue.address, style: const TextStyle(color: AntriColors.muted, fontSize: 13)),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('${venue.waitingCount}', style: numberStyle.copyWith(fontSize: 28)),
                  const Text('waiting', style: TextStyle(color: AntriColors.muted, fontSize: 12)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MyTicketsTab extends ConsumerWidget {
  const _MyTicketsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tickets = ref.watch(myTicketsProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Header('My tickets'),
        Expanded(
          child: tickets.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(myTicketsProvider)),
            data: (list) => RefreshIndicator(
              onRefresh: () => ref.refresh(myTicketsProvider.future),
              child: list.isEmpty
                  ? ListView(children: const [
                      SizedBox(height: 120),
                      Center(child: Text('No tickets yet. Pick a venue to join its queue.')),
                    ])
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, i) {
                        final t = list[i];
                        final (label, color) = statusLabel(t);
                        return ListTile(
                          tileColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          leading: Text('#${t.number}', style: numberStyle.copyWith(fontSize: 24)),
                          title: Text(t.venueName, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(label, style: TextStyle(color: color)),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () async {
                            await Navigator.of(context).push(MaterialPageRoute<void>(
                              builder: (_) => TicketScreen(ticketId: t.id, venueId: t.venueId),
                            ));
                            if (context.mounted) ref.invalidate(myTicketsProvider);
                          },
                        );
                      },
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

class _AlertsTab extends ConsumerWidget {
  const _AlertsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alerts = ref.watch(notificationsProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Header('Alerts'),
        Expanded(
          child: alerts.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(notificationsProvider)),
            data: (list) => RefreshIndicator(
              onRefresh: () => ref.refresh(notificationsProvider.future),
              child: list.isEmpty
                  ? ListView(children: const [SizedBox(height: 120), Center(child: Text('Nothing yet.'))])
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(8, 0, 8, 24),
                      itemCount: list.length,
                      itemBuilder: (context, i) {
                        final n = list[i];
                        return ListTile(
                          leading: Icon(
                            switch (n.type) {
                              'CALLED' => Icons.campaign_rounded,
                              'NO_SHOW' => Icons.timer_off_outlined,
                              _ => Icons.directions_walk_rounded,
                            },
                            color: n.type == 'NO_SHOW' ? AntriColors.brick : AntriColors.teal,
                          ),
                          title: Text(n.message),
                          subtitle: Text(TimeOfDay.fromDateTime(n.createdAt).format(context)),
                        );
                      },
                    ),
            ),
          ),
        ),
      ],
    );
  }
}
