import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Pool, types, type PoolClient } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { postgresSql } from './postgres-sql';

const context = new AsyncLocalStorage<{ sqlite?: true; client?: PoolClient }>();
let database: DatabaseSync | undefined;
let pool: Pool | undefined;
let sqliteQueue: Promise<unknown> = Promise.resolve();

// Explicit test paths keep SQLite isolated even when Next loads .env.local.
export function usesPostgres() {
  return (
    process.env.DATABASE_DRIVER === 'postgres' ||
    (process.env.DATABASE_DRIVER !== 'sqlite' &&
      !process.env.DATABASE_PATH &&
      !!process.env.DATABASE_URL)
  );
}
export function db() {
  if (usesPostgres()) throw new Error('Use the asynchronous database API for PostgreSQL.');
  if (!database) {
    const filename = process.env.DATABASE_PATH || './data/bilimhub.sqlite';
    if (filename !== ':memory:')
      mkdirSync(dirname(resolve(/* turbopackIgnore: true */ filename)), { recursive: true });
    database = new DatabaseSync(filename);
    database.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  }
  return database;
}
export function postgresPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    const url = new URL(process.env.DATABASE_URL);
    if (url.hostname.endsWith('.neon.tech')) url.searchParams.set('sslmode', 'verify-full');
    types.setTypeParser(20, (value) => {
      const number = Number(value);
      if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds safe range.');
      return number;
    });
    types.setTypeParser(16, (value) => (value === 't' ? 1 : 0));
    types.setTypeParser(1700, (value) => {
      const number = Number(value);
      if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER)
        throw new Error('Database numeric exceeds safe range.');
      return number;
    });
    pool = new Pool({
      connectionString: url.href,
      max: 5,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 15000,
      allowExitOnIdle: true,
    });
    attachDatabasePool(pool);
  }
  return pool;
}
async function sqliteExclusive<T>(work: () => T | Promise<T>): Promise<T> {
  if (context.getStore()?.sqlite) return work();
  const next = sqliteQueue.then(work, work);
  sqliteQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
export async function all<T>(sql: string, ...params: SQLInputValue[]): Promise<T[]> {
  if (!usesPostgres())
    return sqliteExclusive(
      () =>
        db()
          .prepare(sql)
          .all(...params) as T[],
    );
  const result = await (context.getStore()?.client || postgresPool()).query(
    postgresSql(sql),
    params,
  );
  return result.rows as T[];
}
export async function one<T>(sql: string, ...params: SQLInputValue[]): Promise<T | undefined> {
  return (await all<T>(sql, ...params))[0];
}
export async function run(sql: string, ...params: SQLInputValue[]): Promise<{ changes: number }> {
  if (!usesPostgres())
    return sqliteExclusive(() => ({
      changes: Number(
        db()
          .prepare(sql)
          .run(...params).changes,
      ),
    }));
  const result = await (context.getStore()?.client || postgresPool()).query(
    postgresSql(sql),
    params,
  );
  return { changes: result.rowCount || 0 };
}
export async function transaction<T>(work: () => T | Promise<T>): Promise<T> {
  if (context.getStore()) return work();
  if (!usesPostgres())
    return sqliteExclusive(async () => {
      db().exec('BEGIN IMMEDIATE');
      try {
        const result = await context.run({ sqlite: true }, work);
        db().exec('COMMIT');
        return result;
      } catch (error) {
        db().exec('ROLLBACK');
        throw error;
      }
    });
  // Preserve read/check/write invariants formerly protected by BEGIN IMMEDIATE.
  for (let attempt = 0; ; attempt++) {
    const client = await postgresPool().connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const result = await context.run({ client }, work);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (attempt >= 4 || !['40001', '40P01'].includes((error as { code?: string }).code || ''))
        throw error;
    } finally {
      client.release();
    }
  }
}
export async function migrate() {
  if (usesPostgres())
    throw new Error('PostgreSQL migrations must run explicitly with npm run db:migrate:postgres.');
  db().exec(
    'CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)',
  );
  for (const name of [
    '001_core',
    '002_university_management',
    '003_lesson_materials',
    '004_course_editor',
    '005_lecture_covers',
    '006_section_trash',
    '007_course_lifecycle_profiles',
    '008_remove_course_pricing',
  ]) {
    if (!(await one('SELECT name FROM migrations WHERE name=?', name)))
      await transaction(async () => {
        db().exec(readFileSync(resolve(`db/migrations/${name}.sql`), 'utf8'));
        await run('INSERT INTO migrations VALUES(?,?)', name, Date.now());
      });
  }
}
