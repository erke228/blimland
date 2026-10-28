import { readFileSync } from 'node:fs';
import { migrationPool } from './postgres-environment';
const pool = migrationPool(),
  client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(18421028)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS bilimhub_schema_migrations(name TEXT PRIMARY KEY,applied_at BIGINT NOT NULL)',
  );
  const name = '001_initial';
  if (
    !(await client.query('SELECT name FROM bilimhub_schema_migrations WHERE name=$1', [name]))
      .rowCount
  ) {
    await client.query(readFileSync('db/postgres/001_initial.sql', 'utf8'));
    await client.query('INSERT INTO bilimhub_schema_migrations VALUES($1,$2)', [name, Date.now()]);
  }
  await client.query('COMMIT');
  console.log('PASS: PostgreSQL migration 001_initial applied/verified (direct connection).');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
