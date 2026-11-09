import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mp4DurationMs } from '../src/lib/mp4-metadata';
import { mp4Fixture } from './video-fixtures';

test('MP4 duration comes from v0/v1 movie headers, including moov after media', () => {
  assert.equal(mp4DurationMs(mp4Fixture(53120)), 53120);
  assert.equal(mp4DurationMs(mp4Fixture(69400, 1)), 69400);
  const bytes = mp4Fixture();
  const moovEnd = 20 + bytes.readUInt32BE(20);
  assert.equal(
    mp4DurationMs(
      Buffer.concat([bytes.subarray(0, 20), bytes.subarray(moovEnd), bytes.subarray(20, moovEnd)]),
    ),
    53000,
  );
});
test('MP4 validation rejects fake signatures, truncated boxes, invalid clocks and audio-only files', () => {
  for (const bytes of [
    Buffer.from('0000ftypmp42test-only-video'),
    Buffer.alloc(0),
    mp4Fixture().subarray(0, 60),
    mp4Fixture(0),
    mp4Fixture(1000, 0, 'soun'),
  ])
    assert.throws(() => mp4DurationMs(bytes));
  const clock = mp4Fixture();
  clock.writeUInt32BE(0, 48);
  assert.throws(() => mp4DurationMs(clock));
  const size = mp4Fixture();
  size.writeUInt32BE(0xffffffff, 20);
  assert.throws(() => mp4DurationMs(size));
});
test('MP4 extended sizes and end-of-file media are bounded without unsafe 64-bit conversion', () => {
  const bytes = mp4Fixture();
  const extended = Buffer.alloc(16);
  extended.writeUInt32BE(1);
  extended.write('ftyp', 4);
  extended.writeBigUInt64BE(28n, 8);
  assert.equal(
    mp4DurationMs(Buffer.concat([extended, bytes.subarray(8, 20), bytes.subarray(20)])),
    53000,
  );
  extended.writeBigUInt64BE(9007199254740992n, 8);
  assert.throws(() => mp4DurationMs(Buffer.concat([extended, bytes.subarray(8)])));
  const terminal = mp4Fixture();
  terminal.writeUInt32BE(0, terminal.length - 24);
  assert.equal(mp4DurationMs(terminal), 53000);
  const hugeTicks = mp4Fixture(1000, 1);
  hugeTicks.writeBigUInt64BE(9007199254740992n, 60);
  assert.throws(() => mp4DurationMs(hugeTicks));
  const free = Buffer.alloc(8);
  free.writeUInt32BE(8);
  free.write('free', 4);
  assert.throws(() => mp4DurationMs(Buffer.concat([...Array(10001).fill(free), bytes])));
});
