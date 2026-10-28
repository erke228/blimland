import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate, one, run, transaction } from '../src/lib/db';
process.env.DATABASE_PATH = ':memory:';
await migrate();
test('Async SQLite transactions roll back and do not expose tentative writes to another request', async () => {
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => (entered = resolve)),
    gate = new Promise<void>((resolve) => (release = resolve));
  const write = transaction(async () => {
    await run('INSERT INTO rate_limits VALUES(?,?,?)', 'async-isolation', 1, 100);
    entered();
    await gate;
    throw new Error('rollback-probe');
  });
  await ready;
  const read = one('SELECT * FROM rate_limits WHERE key=?', 'async-isolation');
  release();
  await assert.rejects(write, /rollback-probe/);
  assert.equal(await read, undefined);
});
