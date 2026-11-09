import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { signDirectVideoPost } from '../src/lib/direct-video-policy';
import type { DirectVideoReservation } from '../src/lib/direct-video-uploads';
const client = new S3Client({
  region: 'us-east-2',
  endpoint: 'https://storage.invalid',
  forcePathStyle: true,
  credentials: { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' },
});
after(() => client.destroy());
function reservation(): DirectVideoReservation {
  const id = randomUUID(),
    now = Date.now();
  return {
    id,
    actor_id: randomUUID(),
    lesson_id: randomUUID(),
    course_id: randomUUID(),
    request_key: randomUUID(),
    storage_key: `${id}.mp4`,
    expected_bytes: 1024 * 1024,
    state: 'pending',
    created_at: now,
    expires_at: now + 15 * 60 * 1000,
  };
}
test('signed POST pins key, exact bytes, private content and metadata with a verifiable SigV4 policy', async () => {
  const row = reservation(),
    post = await signDirectVideoPost(client, row);
  const policy = JSON.parse(Buffer.from(post.fields.Policy, 'base64').toString('utf8'));
  const field = (name: string) =>
    Object.entries(post.fields).find(([key]) => key.toLowerCase() === name)![1];
  assert.equal(new URL(post.url).origin, 'https://storage.invalid');
  assert(new URL(post.url).pathname.includes('bilimhub-files'));
  assert(
    policy.conditions.some(
      (c: unknown) =>
        JSON.stringify(c) ===
        JSON.stringify(['content-length-range', row.expected_bytes, row.expected_bytes]),
    ),
  );
  for (const condition of [
    { key: `videos/${row.storage_key}` },
    { 'Content-Type': 'video/mp4' },
    { 'Cache-Control': 'private, no-store' },
    { 'x-amz-meta-upload-id': row.id },
  ])
    assert(policy.conditions.some((c: unknown) => JSON.stringify(c) === JSON.stringify(condition)));
  assert(
    !policy.conditions.some(
      (c: unknown) => Array.isArray(c) && c[0] === 'starts-with' && c[1] === '$key',
    ),
  );
  assert.equal(post.fields.acl, undefined);
  assert(
    post.expiresAt <= row.expires_at &&
      post.expiresAt <= Date.now() + 300000 &&
      post.expiresAt > Date.now(),
  );
  const [, date, region, service] = field('x-amz-credential').split('/');
  const hmac = (key: Buffer | string, value: string) =>
    createHmac('sha256', key).update(value).digest();
  const signing = hmac(
    hmac(hmac(hmac('AWS4fixture-secret', date), region), service),
    'aws4_request',
  );
  assert.equal(field('x-amz-signature'), hmac(signing, post.fields.Policy).toString('hex'));
  assert(!JSON.stringify(post).includes('fixture-secret'));
});
test('expired, nonpending, oversized and arbitrary-key reservations never receive a signature', async () => {
  for (const change of [
    { expires_at: Date.now() - 1 },
    { state: 'abandoned' as const },
    { expected_bytes: 80 * 1024 * 1024 + 1 },
    { storage_key: '../../foreign.mp4' },
  ])
    await assert.rejects(signDirectVideoPost(client, { ...reservation(), ...change }));
  const short = reservation();
  short.expires_at = Date.now() + 61000;
  assert((await signDirectVideoPost(client, short)).expiresAt <= short.expires_at);
});
