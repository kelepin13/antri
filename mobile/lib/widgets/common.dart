import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/theme.dart';

void showError(BuildContext context, Object error) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(ApiException.from(error).message),
      backgroundColor: AntriColors.brick,
      behavior: SnackBarBehavior.floating,
    ));
}

String formatMinutes(int minutes) {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return '~$minutes min';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  return m == 0 ? '~${h}h' : '~${h}h ${m}m';
}

/// Full-screen friendly error with a retry button.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_rounded, size: 48, color: AntriColors.muted),
            const SizedBox(height: 12),
            Text(ApiException.from(error).message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}

/// Small rounded label, e.g. "Open", "Clinic".
class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.color = AntriColors.teal});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12)),
    );
  }
}
