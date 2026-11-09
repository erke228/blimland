import { realpathSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Deliberately local-only. Do not load .env files or migrate/create a database here.
function contained(root: string, candidate: string) {
  const rel = relative(root, candidate);
  return (
    !!rel &&
    rel !== '..' &&
    !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
    !isAbsolute(rel)
  );
}
try {
  if (
    process.env.DATABASE_DRIVER !== 'sqlite' ||
    process.env.STORAGE_DRIVER !== 'local' ||
    process.env.DATABASE_URL
  )
    throw new Error('Explicit isolated SQLite/local storage without DATABASE_URL is required.');
  if (!process.env.DATABASE_PATH || !process.env.VIDEO_DIR)
    throw new Error('Explicit DATABASE_PATH and VIDEO_DIR are required.');
  const root = realpathSync(resolve('.test-data'));
  if (!contained(realpathSync(process.cwd()), root))
    throw new Error('Test root escapes the workspace.');
  const database = realpathSync(resolve(process.env.DATABASE_PATH));
  const videos = realpathSync(resolve(process.env.VIDEO_DIR));
  if (
    !contained(root, database) ||
    !contained(root, videos) ||
    !statSync(database).isFile() ||
    !statSync(videos).isDirectory()
  )
    throw new Error('Existing database and video directory must be inside .test-data.');
  process.env.DATABASE_PATH = database;
  process.env.VIDEO_DIR = videos;
  const options = { cycles: 1, 'interval-ms': 1000, batch: 25, 'max-batches': 100 };
  for (const arg of process.argv.slice(2)) {
    const match = /^--(cycles|interval-ms|batch|max-batches)=(\d+)$/.exec(arg);
    if (!match) throw new Error('Unknown cleanup option.');
    options[match[1] as keyof typeof options] = Number(match[2]);
  }
  if (
    !Number.isSafeInteger(options.cycles) ||
    options.cycles < 1 ||
    options.cycles > 10 ||
    options['interval-ms'] < 100 ||
    options['interval-ms'] > 60000 ||
    options.batch < 1 ||
    options.batch > 100 ||
    options['max-batches'] < 1 ||
    options['max-batches'] > 1000
  )
    throw new Error('Cleanup limits are out of range.');
  const { cleanDirectVideoStaging } = await import('../src/lib/direct-video-uploads');
  let failures = false;
  for (let cycle = 1; cycle <= options.cycles; cycle++) {
    let cursor = '',
      batches = 0,
      checked = 0,
      removed = 0,
      failed = 0;
    do {
      const result = await cleanDirectVideoStaging(cursor, options.batch);
      cursor = result.nextCursor;
      checked += result.checked;
      removed += result.removed;
      failed += result.failed;
      batches++;
    } while (cursor && batches < options['max-batches']);
    const incomplete = !!cursor;
    failures ||= failed > 0 || incomplete;
    console.log(JSON.stringify({ cycle, checked, deleteConfirmed: removed, failed, incomplete }));
    if (cycle < options.cycles) await delay(options['interval-ms']);
  }
  if (failures) process.exitCode = 1;
} catch {
  // Configuration/errors may contain credentials or private paths. Never print them here.
  console.error(
    'Cleanup refused or failed. Check isolated local paths, schema and bounded options.',
  );
  process.exitCode = 1;
}
