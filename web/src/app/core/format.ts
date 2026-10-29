/** "~8 min", "~1h 20m", or "No wait". */
export function formatWait(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'No data yet';
  if (minutes <= 0) return 'No wait';
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}

export const TIMEZONES = [
  'Asia/Jakarta',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Taipei',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
];
