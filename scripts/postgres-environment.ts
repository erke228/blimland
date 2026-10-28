import { existsSync } from 'node:fs';
import { Pool } from 'pg';
export function loadEnvironment() {
  const explicit = process.env.APP_ENV_FILE;
  if (explicit) process.loadEnvFile(explicit);
  else for (const file of ['.env.local', '.env']) if (existsSync(file)) process.loadEnvFile(file);
}
export function migrationPool() {
  loadEnvironment();
  const value = process.env.DATABASE_URL_UNPOOLED;
  if (!value) throw new Error('DATABASE_URL_UNPOOLED is required for migrations.');
  const url = new URL(value);
  if (url.hostname.includes('-pooler.')) throw new Error('Use a direct connection for migrations.');
  url.searchParams.set('sslmode', 'verify-full');
  return new Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 20000 });
}
