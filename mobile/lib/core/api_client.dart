import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/auth_controller.dart';
import 'config.dart';

/// Error from the backend, which always answers `{ statusCode, code, message }`.
class ApiException implements Exception {
  const ApiException(this.code, this.message, {this.statusCode, this.data = const {}});

  final String code;
  final String message;
  final int? statusCode;
  final Map<String, dynamic> data;

  /// True when the request may or may not have reached the server, so retrying
  /// with the same idempotency key is the safe move.
  bool get isNetwork => code == 'NETWORK';

  @override
  String toString() => message;

  factory ApiException.from(Object error) {
    if (error is ApiException) return error;
    if (error is DioException) {
      final body = error.response?.data;
      if (body is Map<String, dynamic> && body['code'] is String) {
        return ApiException(
          body['code'] as String,
          body['message']?.toString() ?? 'Request failed',
          statusCode: error.response?.statusCode,
          data: body,
        );
      }
      if (error.response == null) {
        return const ApiException('NETWORK', "Can't reach the server. Check your connection and try again.");
      }
      return ApiException('HTTP_${error.response!.statusCode}', 'Request failed', statusCode: error.response!.statusCode);
    }
    return ApiException('UNKNOWN', error.toString());
  }
}

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(
    baseUrl: apiUrl,
    connectTimeout: const Duration(seconds: 8),
    receiveTimeout: const Duration(seconds: 10),
    contentType: 'application/json',
  ));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      final token = ref.read(authControllerProvider).value?.token;
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
      handler.next(options);
    },
    onError: (error, handler) {
      // Expired or revoked token: drop the session so the app returns to login.
      final hadToken = error.requestOptions.headers.containsKey('Authorization');
      if (error.response?.statusCode == 401 && hadToken) {
        ref.read(authControllerProvider.notifier).logout();
      }
      handler.next(error);
    },
  ));
  return dio;
});

/// Small helpers so screens deal in models and [ApiException], never in Dio.
extension DioJson on Dio {
  Future<T> getJson<T>(String path) async {
    try {
      return (await get<T>(path)).data as T;
    } catch (e) {
      throw ApiException.from(e);
    }
  }

  Future<T> postJson<T>(String path, {Object? body, Map<String, String>? headers}) async {
    try {
      return (await post<T>(path, data: body, options: Options(headers: headers))).data as T;
    } catch (e) {
      throw ApiException.from(e);
    }
  }

  Future<T> patchJson<T>(String path, {Object? body}) async {
    try {
      return (await patch<T>(path, data: body)).data as T;
    } catch (e) {
      throw ApiException.from(e);
    }
  }
}
