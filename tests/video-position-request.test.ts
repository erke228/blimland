import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sendVideoPosition } from '../src/lib/video-position-request';

test('position saves send only measured position to same-origin API and reject HTTP failures', async () => {
  const id = randomUUID();
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, `/learn/${id}/video/progress`);
    assert.equal(options?.method, 'POST');
    assert.equal(options?.credentials, 'same-origin');
    assert.equal(options?.keepalive, true);
    assert.deepEqual(Array.from((options?.body as FormData).entries()), [['position', '12.5']]);
    assert.equal(options?.signal?.aborted, false);
    return new Response(null, { status: 204 });
  };
  await sendVideoPosition(id, 12.5, request);
  for (const status of [401, 403, 409, 503])
    await assert.rejects(
      sendVideoPosition(id, 0, async () => new Response(null, { status })),
      /not saved/,
    );
});

test('a stalled position request aborts, rejects and permits a subsequent save', async () => {
  let aborted = false;
  const hanging: typeof fetch = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options!.signal!.addEventListener(
        'abort',
        () => {
          aborted = true;
          reject(new Error('aborted'));
        },
        { once: true },
      );
    });
  const id = randomUUID();
  await assert.rejects(sendVideoPosition(id, 25, hanging, 20), /aborted/);
  assert.equal(aborted, true);
  await sendVideoPosition(id, 25, async () => new Response(null, { status: 204 }));
});

test('completed requests retire their timers and invalid positions never reach transport', async () => {
  let signal: AbortSignal | undefined;
  const success: typeof fetch = async (_url, options) => {
    signal = options!.signal!;
    return new Response(null, { status: 204 });
  };
  await sendVideoPosition(randomUUID(), 0, success, 10);
  await new Promise((done) => setTimeout(done, 30));
  assert.equal(signal!.aborted, false);
  let calls = 0;
  const unreachable: typeof fetch = async () => {
    calls++;
    throw new Error('unexpected request');
  };
  for (const position of [NaN, Infinity, -1])
    await assert.rejects(sendVideoPosition(randomUUID(), position, unreachable));
  await assert.rejects(sendVideoPosition('../other', 1, unreachable));
  await assert.rejects(sendVideoPosition(randomUUID(), 1, unreachable, 10001));
  assert.equal(calls, 0);
});
