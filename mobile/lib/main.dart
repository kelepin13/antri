import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/customer/customer_home.dart';
import 'features/staff/staff_console_screen.dart';

void main() {
  runApp(const ProviderScope(child: AntriApp()));
}

class AntriApp extends StatelessWidget {
  const AntriApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Antri',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: const _Root(),
    );
  }
}

/// Picks the first screen from the session: login, customer app or staff console.
class _Root extends ConsumerWidget {
  const _Root();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authControllerProvider);
    return session.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, __) => const LoginScreen(),
      data: (session) {
        if (session == null) return const LoginScreen();
        return session.user.isStaff ? const StaffConsoleScreen() : const CustomerHome();
      },
    );
  }
}
