import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readExactVideoBytes } from '../src/lib/bounded-storage-read';
import { getReservedVideoBytes } from '../src/lib/storage';
import { MAX_DIRECT_VIDEO_BYTES } from '../src/lib/video-limits';

test('reserved reader rejects invalid limits before touching the stream', async () => {
  let touched = false;
  async function* source() {
    touched = true;
    yield Buffer.from('x');
  }
  for (const size of [0, -1, 1.5, NaN, Infinity, MAX_DIRECT_VIDEO_BYTES + 1])
    await assert.rejects(readExactVideoBytes(source(), size), /Invalid expected/);
  assert.equal(touched, false);
});

test('reserved reader owns reused chunks and requires exact actual length', async () => {
  async function* source() {
    const bytes = Buffer.from('ab');
    yield bytes;
    bytes.fill('c');
    yield bytes;
  }
  assert.equal((await readExactVideoBytes(source(), 4)).toString(), 'abcc');
  await assert.rejects(readExactVideoBytes(source(), 5), /differs/);
});

test('reserved reader stops and closes an oversized or failed source', async () => {
  let closed = false,
    continued = false;
  async function* oversized() {
    try {
      yield Buffer.alloc(4);
      continued = true;
      yield Buffer.alloc(4);
    } finally {
      closed = true;
    }
  }
  await assert.rejects(readExactVideoBytes(oversized(), 3), /exceeds/);
  assert.equal(closed, true);
  assert.equal(continued, false);
  async function* failed() {
    yield Buffer.from('a');
    throw new Error('interrupted');
  }
  await assert.rejects(readExactVideoBytes(failed(), 2), /interrupted/);
});

test('local private staging read enforces key and exact size without changing bytes', async () => {
  process.env.STORAGE_DRIVER = 'local';
  const dir = await mkdtemp(join(tmpdir(), 'bilimhub-bounded-'));
  const path = join(dir, 'fixture.mp4');
  const key = `videos/${randomUUID()}.mp4`;
  try {
    await writeFile(path, 'fixture');
    assert.equal((await getReservedVideoBytes(key, path, 7)).toString(), 'fixture');
    await assert.rejects(getReservedVideoBytes(key, path, 6), /exceeds/);
    await assert.rejects(getReservedVideoBytes(key, path, 8), /differs/);
    await assert.rejects(
      getReservedVideoBytes('videos/../secret.mp4', path, 7),
      /Invalid storage key/,
    );
    await assert.rejects(
      getReservedVideoBytes(`covers/${randomUUID()}.webp`, path, 7),
      /video key/,
    );
  } finally {
    await rm(path);
    await rmdir(dir);
  }
});
