/// Backend URL. Override per build:
///   flutter run --dart-define=API_URL=http://192.168.1.10:3000
///
/// The default `10.0.2.2` is how the Android emulator reaches your computer's
/// localhost. On the iOS simulator use http://localhost:3000; on a real phone use
/// your computer's LAN IP.
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000');
