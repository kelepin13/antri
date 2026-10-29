#!/usr/bin/env bash
# Generates the android/ and ios/ folders (kept out of git) and allows plain HTTP to
# your local backend during development. Run once from the mobile/ folder:
#   ./tool/setup_platforms.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Only adds missing files; lib/, pubspec.yaml and test/ are left untouched.
flutter create . --project-name antri --org dev.antri --platforms=android,ios
flutter pub get

# Android: network permission for release builds, and http:// allowed for local development.
MANIFEST=android/app/src/main/AndroidManifest.xml
grep -q 'android.permission.INTERNET' "$MANIFEST" ||
  perl -0pi -e 's#(<application)#<uses-permission android:name="android.permission.INTERNET"/>\n    $1#' "$MANIFEST"
grep -q 'usesCleartextTraffic' "$MANIFEST" ||
  perl -0pi -e 's#<application#<application android:usesCleartextTraffic="true"#' "$MANIFEST"

# iOS (macOS only): allow http:// to localhost and your local network.
PLIST=ios/Runner/Info.plist
if [[ -x /usr/libexec/PlistBuddy ]] && ! grep -q 'NSAppTransportSecurity' "$PLIST"; then
  /usr/libexec/PlistBuddy \
    -c 'Add :NSAppTransportSecurity dict' \
    -c 'Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true' \
    "$PLIST"
fi

echo "Done. Start the backend (docker compose up --build), then run: flutter run"
