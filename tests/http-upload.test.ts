import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameOrigin, requestOrigin, boundedForm } from '../src/lib/http-upload';
test('Local upload checks and redirects use actual Host rather than the Next internal localhost URL', () => {
  const old = process.env.APP_ORIGIN;
  delete process.env.APP_ORIGIN;
  try {
    const request = new Request('http://localhost:3000/api/courses', {
      headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' },
    });
    assert(sameOrigin(request));
    assert.equal(requestOrigin(request), 'http://127.0.0.1:3000');
    assert(
      !sameOrigin(
        new Request(request, {
          headers: {
            host: '127.0.0.1:3000',
            origin: 'https://evil.invalid',
            'x-forwarded-host': 'evil.invalid',
          },
        }),
      ),
    );
    assert(!sameOrigin(new Request(request, { headers: { host: '127.0.0.1:3000' } })));
  } finally {
    if (old === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = old;
  }
});
test('Configured public origin is authoritative even when Host and forwarded headers differ', () => {
  const old = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://learn.example.invalid';
  try {
    const request = new Request('http://localhost:3000/api/courses', {
      headers: {
        host: 'evil.invalid',
        origin: 'https://learn.example.invalid',
        'x-forwarded-host': 'evil.invalid',
      },
    });
    assert(sameOrigin(request));
    assert.equal(requestOrigin(request), 'https://learn.example.invalid');
    assert(
      !sameOrigin(
        new Request(request, { headers: { host: 'evil.invalid', origin: 'https://evil.invalid' } }),
      ),
    );
  } finally {
    if (old === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = old;
  }
});
test('Multipart parsing enforces the real byte limit even without Content-Length', async () => {
  const body = new FormData();
  body.set('file', new Blob(['x'.repeat(2048)]), 'large.txt');
  const request = new Request('http://localhost', { method: 'POST', body });
  await assert.rejects(
    boundedForm(request, 1024),
    (error: unknown) => (error as { status: number }).status === 413,
  );
});
