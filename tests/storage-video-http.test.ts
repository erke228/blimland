import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { getReservedVideoBytes, putStored, getStored, deleteStored } from '../src/lib/storage';

// Exercise the actual SDK HTTP adapter with fake credentials against loopback only.
// This is not a substitute for Neon POST policy/CORS enforcement acceptance.
test(
  'private video SDK uses bounded real HTTP streams and preserves exact final bytes',
  { timeout: 15000 },
  async () => {
    const objects = new Map<string, Buffer>();
    let stalledClosed = 0;
    const requests: { method: string; path: string; signed: boolean; private: boolean }[] = [];
    const server = createServer(async (req, res) => {
      const path = new URL(req.url!, 'http://localhost').pathname;
      requests.push({
        method: req.method!,
        path,
        signed: !!req.headers.authorization?.includes('Credential=fixture-http-access/'),
        private: req.headers['cache-control'] === 'private, no-store',
      });
      if (req.method === 'PUT') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        objects.set(path, Buffer.concat(chunks));
        res.writeHead(200, { ETag: '"fixture"' }).end();
      } else if (req.method === 'DELETE') {
        objects.delete(path);
        res.writeHead(204).end();
      } else if (req.method === 'GET') {
        if (/00000000000[456]\.mp4$/.test(path)) {
          res.on('close', () => {
            stalledClosed++;
          });
          if (!path.endsWith('004.mp4')) {
            res.writeHead(200, { 'Content-Type': 'video/mp4' });
            res.write('a');
          }
          if (path.endsWith('006.mp4')) {
            const drip = setInterval(() => res.write('b'), 20);
            res.on('close', () => clearInterval(drip));
          }
          // 004 never returns headers, 005 stalls after headers, 006 drips forever.
        } else if (path.includes('/00000000-0000-0000-0000-000000000001.')) {
          // Missing length, actual stream exceeds reservation.
          res.writeHead(200, { 'Content-Type': 'video/mp4' });
          res.write('abc');
          res.end('def');
        } else if (path.includes('/00000000-0000-0000-0000-000000000002.')) {
          res.writeHead(200, { 'Content-Length': '99' });
          res.end('untrusted');
        } else if (path.includes('/00000000-0000-0000-0000-000000000003.')) {
          res.writeHead(200, { 'Content-Length': '5' });
          res.write('abc');
          setTimeout(() => res.destroy(), 10);
        } else {
          const bytes = objects.get(path);
          if (!bytes) {
            res
              .writeHead(404, { 'Content-Type': 'application/xml' })
              .end('<Error><Code>NoSuchKey</Code></Error>');
            return;
          }
          res.writeHead(200, {
            'Content-Length': String(bytes.length),
            'Content-Type': 'video/mp4',
          });
          res.write(bytes.subarray(0, 2));
          res.end(bytes.subarray(2));
        }
      } else res.writeHead(405).end();
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    process.env.STORAGE_DRIVER = 'neon';
    process.env.DATABASE_DRIVER = 'sqlite';
    process.env.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.AWS_ACCESS_KEY_ID = 'fixture-http-access';
    process.env.AWS_SECRET_ACCESS_KEY = 'fixture-http-secret';
    process.env.AWS_REGION = 'us-east-2';
    process.env.AWS_MAX_ATTEMPTS = '1';
    const key = `videos/${randomUUID()}.mp4`,
      bytes = Buffer.from('actual video fixture bytes');
    try {
      await putStored(key, 'unused-local-path', bytes, 'video/mp4');
      assert.deepEqual(await getReservedVideoBytes(key, 'unused-local-path', bytes.length), bytes);
      assert.deepEqual(await getStored(key, 'unused-local-path'), bytes);
      await assert.rejects(
        getReservedVideoBytes(key, 'unused-local-path', bytes.length - 1),
        /differs/,
      );
      const malformed = (n: number) =>
        `videos/00000000-0000-0000-0000-${String(n).padStart(12, '0')}.mp4`;
      await assert.rejects(getReservedVideoBytes(malformed(1), 'unused', 5), /exceeds/);
      await assert.rejects(getReservedVideoBytes(malformed(2), 'unused', 5), /differs/);
      await assert.rejects(getReservedVideoBytes(malformed(3), 'unused', 5));
      for (const n of [4, 5, 6]) {
        await assert.rejects(getReservedVideoBytes(malformed(n), 'unused', 1000, 150), /timed out/);
      }
      // Socket closure is asynchronous at the server even after the caller has rejected.
      await new Promise((done) => setTimeout(done, 30));
      assert.equal(stalledClosed, 3);
      for (const timeout of [0, -1, 1.5, 30001, NaN])
        await assert.rejects(
          getReservedVideoBytes(key, 'unused', bytes.length, timeout),
          /timeout/,
        );
      assert.deepEqual(await getReservedVideoBytes(key, 'unused', bytes.length), bytes);
      await deleteStored(key, 'unused-local-path');
      await deleteStored(key, 'unused-local-path');
      await assert.rejects(getReservedVideoBytes(key, 'unused-local-path', bytes.length));
      assert.equal(objects.size, 0);
      assert(requests.every((r) => r.signed && r.path.startsWith('/bilimhub-files/videos/')));
      assert(requests.find((r) => r.method === 'PUT')!.private);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    }
  },
);
