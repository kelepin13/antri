// Tests run against a real PostgreSQL and Redis (docker compose, CI services, or local).
// Concurrency guarantees can't be tested against mocks.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://antri:antri@localhost:5432/antri_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret';
