import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let database: DatabaseSync | undefined;

export function db() {
  if (!database) {
    const filename = process.env.DATABASE_PATH || './data/bilimhub.sqlite';
    if (filename !== ':memory:')
      mkdirSync(dirname(resolve(/* turbopackIgnore: true */ filename)), { recursive: true });
    database = new DatabaseSync(filename);
    database.exec(
      'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
    );
  }
  return database;
}

export function one<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return db()
    .prepare(sql)
    .get(...params) as T | undefined;
}
export function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return db()
    .prepare(sql)
    .all(...params) as T[];
}
export function run(sql: string, ...params: SQLInputValue[]) {
  return db()
    .prepare(sql)
    .run(...params);
}
export function transaction<T>(work: () => T): T {
  db().exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db().exec('COMMIT');
    return result;
  } catch (error) {
    db().exec('ROLLBACK');
    throw error;
  }
}
export function migrate() {
  db().exec(
    'CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  for (const name of ['001_core', '002_university_management', '003_lesson_materials']) {
    if (!one('SELECT name FROM migrations WHERE name = ?', name)) {
      transaction(() => {
        db().exec(readFileSync(resolve(`db/migrations/${name}.sql`), 'utf8'));
        run('INSERT INTO migrations VALUES (?, ?)', name, Date.now());
      });
    }
  }
}
