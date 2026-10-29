import 'package:flutter/material.dart';

/// A paper-ticket look: warm paper background, ink text, marigold accent.
class AntriColors {
  static const ink = Color(0xFF1B2A41);
  static const paper = Color(0xFFFBF7EF);
  static const marigold = Color(0xFFF2A541);
  static const teal = Color(0xFF2A9D8F);
  static const brick = Color(0xFFC8553D);
  static const muted = Color(0xFF6B7280);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AntriColors.teal,
    surface: AntriColors.paper,
    primary: AntriColors.ink,
    secondary: AntriColors.marigold,
    error: AntriColors.brick,
  );
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: AntriColors.paper,
    useMaterial3: true,
    appBarTheme: const AppBarTheme(
      backgroundColor: AntriColors.paper,
      foregroundColor: AntriColors.ink,
      elevation: 0,
      centerTitle: false,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}

/// Ticket numbers use tabular figures so digits don't jump around as they change.
const numberStyle = TextStyle(
  fontFeatures: [FontFeature.tabularFigures()],
  fontWeight: FontWeight.w800,
  color: AntriColors.ink,
  letterSpacing: -1,
);
