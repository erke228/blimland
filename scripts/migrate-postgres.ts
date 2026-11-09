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
  for (const [name, path] of [
    ['001_initial', 'db/postgres/001_initial.sql'],
    ['002_learning_tools', 'db/migrations/009_learning_tools.sql'],
    ['003_video_cleanup', 'db/migrations/010_video_cleanup.sql'],
    ['004_direct_video_uploads', 'db/migrations/011_direct_video_uploads.sql'],
    ['005_direct_video_final_objects', 'db/migrations/012_direct_video_final_objects.sql'],
  ]) {
    if (
      !(await client.query('SELECT name FROM bilimhub_schema_migrations WHERE name=$1', [name]))
        .rowCount
    ) {
      await client.query(readFileSync(path, 'utf8'));
      await client.query('INSERT INTO bilimhub_schema_migrations VALUES($1,$2)', [
        name,
        Date.now(),
      ]);
    }
  }
  await client.query('COMMIT');
  console.log(
    'PASS: PostgreSQL migrations 001_initial–005_direct_video_final_objects applied/verified (direct connection).',
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
