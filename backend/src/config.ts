function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer`);
  return parsed;
}

export const config = {
  get port() {
    return int('PORT', 3000);
  },
  get databaseUrl() {
    return required('DATABASE_URL', 'postgres://antri:antri@localhost:5432/antri');
  },
  get redisUrl() {
    return required('REDIS_URL', 'redis://localhost:6379');
  },
  get jwtSecret() {
    return required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-only-secret');
  },
  get jwtExpiresInSeconds() {
    return int('JWT_EXPIRES_IN_SECONDS', 60 * 60 * 24 * 7);
  },
  /** A CALLED ticket that is not served within this window becomes NO_SHOW. */
  get noShowAfterMinutes() {
    return int('NO_SHOW_AFTER_MINUTES', 10);
  },
  get sweepEveryMs() {
    return int('SWEEP_EVERY_MS', 60_000);
  },
};

/** Redis channel the worker and API instances use to announce queue changes. */
export const VENUE_CHANGED_CHANNEL = 'antri:venue-changed';
export const NOTIFICATIONS_QUEUE = 'notifications';
