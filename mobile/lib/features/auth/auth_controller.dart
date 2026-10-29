import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';
import '../../models/models.dart';

const _sessionKey = 'antri.session';

/// The signed-in session, or null. Restored from disk on start.
final authControllerProvider = AsyncNotifierProvider<AuthController, AuthSession?>(AuthController.new);

class AuthController extends AsyncNotifier<AuthSession?> {
  @override
  Future<AuthSession?> build() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_sessionKey);
    if (raw == null) return null;
    try {
      return AuthSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      await prefs.remove(_sessionKey);
      return null;
    }
  }

  /// Throws [ApiException] on failure; the session state is left unchanged.
  Future<void> login(String email, String password) =>
      _authenticate('/auth/login', {'email': email.trim(), 'password': password});

  Future<void> register(String name, String email, String password) =>
      _authenticate('/auth/register', {'name': name.trim(), 'email': email.trim(), 'password': password});

  Future<void> _authenticate(String path, Map<String, String> body) async {
    final json = await ref.read(dioProvider).postJson<Map<String, dynamic>>(path, body: body);
    final session = AuthSession.fromJson(json);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_sessionKey, jsonEncode(session.toJson()));
    state = AsyncData(session);
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_sessionKey);
    state = const AsyncData(null);
  }
}
