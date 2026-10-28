import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { migrationPool } from './postgres-environment';
import { putStored, getStored } from '../src/lib/storage';

const sourceArgument = process.argv.indexOf('--source');
if (sourceArgument < 0 || !process.argv.includes('--confirm-empty-target'))
  throw new Error(
    'Usage: npm run db:import:sqlite -- --source <snapshot.sqlite> --confirm-empty-target',
  );
const source = resolve(process.argv[sourceArgument + 1]);
if (!existsSync(source)) throw new Error('SQLite snapshot not found.');
const pool = migrationPool();
process.env.DATABASE_DRIVER = 'postgres';
process.env.STORAGE_DRIVER = 'neon';
const sqlite = new DatabaseSync(source, { readOnly: true });
const tables = sqlite
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid",
  )
  .all()
  .map((row) => String(row.name))
  .filter((name) => !['migrations', 'sessions', 'rate_limits'].includes(name));
const identifier = (name: string) => {
  if (!/^[a-z_]+$/.test(name)) throw Error('Unexpected identifier');
  return `"${name}"`;
};
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const sourceHash = digest(readFileSync(source));
const counts: Record<string, number> = {};
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(18421028)');
  // Never clear a non-empty target or overwrite live user changes.
  for (const name of tables)
    if (Number((await client.query(`SELECT COUNT(*) n FROM ${identifier(name)}`)).rows[0].n))
      throw new Error(`Target table ${name} is not empty; import stopped.`);
  const assets = new Map<string, string>();
  function localFile(key: string, kind: 'materials' | 'covers' | 'avatars') {
    const candidates =
      kind === 'materials'
        ? [resolve('uploads/materials', key), resolve('uploads', key)]
        : [resolve('uploads', kind, key), resolve('uploads/materials', kind, key)];
    const found = candidates.find((path) => existsSync(path));
    if (!found) throw new Error(`Missing source asset: ${kind}/${key}`);
    assets.set(`${kind}/${key}`, found);
  }
  for (const row of sqlite.prepare('SELECT storage_key,kind FROM lesson_materials').all()) {
    localFile(String(row.storage_key), 'materials');
    if (row.kind === 'docx') localFile(String(row.storage_key) + '.html', 'materials');
  }
  for (const row of sqlite.prepare('SELECT storage_key FROM course_cover_files').all())
    localFile(String(row.storage_key), 'covers');
  for (const row of sqlite
    .prepare('SELECT avatar_key FROM user_profiles WHERE avatar_key IS NOT NULL')
    .all())
    localFile(String(row.avatar_key), 'avatars');
  for (const [key, path] of assets) {
    const bytes = readFileSync(path);
    const type = key.endsWith('.html')
      ? 'text/html; charset=utf-8'
      : key.endsWith('.webp')
        ? 'image/webp'
        : key.endsWith('.pdf')
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    let existing: Buffer | undefined;
    try {
      existing = await getStored(key, path);
    } catch (error) {
      if (
        (error as { name: string }).name !== 'NoSuchKey' &&
        (error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode !== 404
      )
        throw error;
    }
    if (existing) assert.equal(digest(existing), digest(bytes), 'Existing remote asset differs.');
    else await putStored(key, path, bytes, type);
    assert.equal(digest(await getStored(key, path)), digest(bytes), 'Remote asset hash differs.');
  }
  for (const name of tables) {
    const rows = sqlite.prepare(`SELECT * FROM ${identifier(name)}`).all();
    for (const row of rows) {
      const columns = Object.keys(row);
      await client.query(
        `INSERT INTO ${identifier(name)} (${columns.map(identifier).join(',')}) VALUES(${columns.map((_, i) => `$${i + 1}`).join(',')})`,
        Object.values(row),
      );
    }
    const copied = (await client.query(`SELECT * FROM ${identifier(name)}`)).rows;
    const columns = sqlite.prepare(`PRAGMA table_info(${identifier(name)})`).all();
    const canonical = (row: Record<string, unknown>) =>
      JSON.stringify(
        columns.map((column) => {
          const value = row[String(column.name)];
          return value !== null && column.type === 'INTEGER' ? Number(value) : value;
        }),
      );
    assert.deepEqual(
      copied.map(canonical).sort(),
      rows.map(canonical).sort(),
      `Row verification failed: ${name}`,
    );
    counts[name] = rows.length;
  }
  await client.query('COMMIT');
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        database: 'Neon PostgreSQL',
        sourceHash,
        verifiedRows: counts,
        verifiedPrivateAssets: assets.size,
        localSessionsTransferred: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  sqlite.close();
  client.release();
  await pool.end();
}
