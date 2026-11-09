import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  symlinkSync,
  rmdirSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

mkdirSync('.test-data', { recursive: true });
function fixture() {
  const dir = mkdtempSync(resolve('.test-data', 'staging-cli-'));
  const videos = join(dir, 'videos'),
    database = join(dir, 'test.sqlite');
  mkdirSync(videos);
  const db = new DatabaseSync(database);
  db.exec(readFileSync('db/migrations/011_direct_video_uploads.sql', 'utf8'));
  db.exec('CREATE TABLE lesson_videos(lesson_id TEXT, storage_key TEXT)');
  const id = randomUUID(),
    key = `${id}.mp4`,
    now = Date.now();
  db.prepare('INSERT INTO direct_video_uploads VALUES(?,?,?,?,?,?,?,?,?,?)').run(
    id,
    'fixture',
    'lesson',
    'course',
    randomUUID(),
    key,
    5,
    'abandoned',
    now - 20000,
    now - 10000,
  );
  db.close();
  const path = join(videos, key);
  writeFileSync(path, 'first');
  return { database, videos, path };
}
function command(
  env: Partial<NodeJS.ProcessEnv>,
  args: string[] = [],
  onLine?: (line: string) => void,
) {
  return new Promise<{ code: number | null; output: string }>((done) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'scripts/clean-video-staging.ts', ...args],
      {
        env: {
          ...process.env,
          DATABASE_DRIVER: 'sqlite',
          STORAGE_DRIVER: 'local',
          DATABASE_URL: '',
          ...env,
        },
        windowsHide: true,
      },
    );
    let output = '',
      pending = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      pending += text;
      while (pending.includes('\n')) {
        const end = pending.indexOf('\n');
        onLine?.(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('close', (code) => done({ code, output }));
  });
}
test('local cleanup CLI repeats full scans and reaps a late upload without deleting journal', async () => {
  const f = fixture();
  const result = await command(
    { DATABASE_PATH: f.database, VIDEO_DIR: f.videos },
    ['--cycles=2', '--interval-ms=200', '--batch=1'],
    (line) => {
      if (line.startsWith('{') && JSON.parse(line).cycle === 1) writeFileSync(f.path, 'late!');
    },
  );
  assert.equal(result.code, 0, result.output);
  assert.equal(existsSync(f.path), false);
  const reports = result.output
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line));
  assert.equal(reports.length, 2);
  assert(reports.every((r) => r.checked === 1 && r.failed === 0 && !r.incomplete));
  const db = new DatabaseSync(f.database, { readOnly: true });
  assert.equal(
    (db.prepare('SELECT COUNT(*) n FROM direct_video_uploads').get() as { n: number }).n,
    1,
  );
  db.close();
});
test('cleanup CLI refuses production configuration, escaping paths and unbounded options', async () => {
  const f = fixture();
  for (const env of [
    { DATABASE_DRIVER: 'postgres' },
    { STORAGE_DRIVER: 'neon' },
    { DATABASE_URL: 'postgresql://fake-secret.invalid' },
    { DATABASE_PATH: resolve('package.json') },
    { VIDEO_DIR: resolve('.') },
    { DATABASE_PATH: join(f.videos, 'missing.sqlite') },
  ]) {
    const result = await command({ DATABASE_PATH: f.database, VIDEO_DIR: f.videos, ...env });
    assert.equal(result.code, 1);
    assert.equal(result.output.includes('fake-secret'), false);
    assert.equal(existsSync(f.path), true);
  }
  for (const arg of [
    '--cycles=999',
    '--batch=0',
    '--max-batches=0',
    '--interval-ms=0',
    '--unknown=1',
  ])
    assert.equal(
      (await command({ DATABASE_PATH: f.database, VIDEO_DIR: f.videos }, [arg])).code,
      1,
    );
  const outside = mkdtempSync(join(tmpdir(), 'bilimhub-cli-outside-'));
  const link = join(f.videos, 'escape');
  try {
    symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal((await command({ DATABASE_PATH: f.database, VIDEO_DIR: link })).code, 1);
  } finally {
    rmdirSync(link);
    rmdirSync(outside);
  }
});
test('cleanup CLI reports incomplete bounded batches with failure exit status', async () => {
  const f = fixture();
  const result = await command({ DATABASE_PATH: f.database, VIDEO_DIR: f.videos }, [
    '--batch=1',
    '--max-batches=1',
  ]);
  assert.equal(result.code, 1);
  const report = JSON.parse(result.output.split('\n').find((line) => line.startsWith('{'))!);
  assert.equal(report.incomplete, true);
});
