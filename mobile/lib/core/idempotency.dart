import 'dart:math';

final _random = Random.secure();

/// A random key for one *intent* (e.g. "join this queue"). Reuse the same key when
/// retrying after a timeout so the server returns the original ticket instead of
/// creating a second one.
String newIdempotencyKey() {
  final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
  return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
}
