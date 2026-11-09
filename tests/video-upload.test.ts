import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendVideoUpload, VideoUploadError, type VideoUploadStage } from '../src/lib/video-upload';

class RequestFixture {
  upload = {
    onprogress: null as
      | null
      | ((e: { loaded: number; total: number; lengthComputable: boolean }) => void),
    onload: null as null | (() => void),
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  timeout = 0;
  withCredentials = false;
  method = '';
  url = '';
  body?: FormData;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: FormData) {
    this.body = body;
  }
  make = () => this as unknown as XMLHttpRequest;
}
test('upload percentages reflect measured bytes; 100% upload is not a saved result', async () => {
  const request = new RequestFixture(),
    stages: VideoUploadStage[] = [],
    body = new FormData();
  const result = sendVideoUpload(
    '/learn/fixture/video',
    body,
    'PUT',
    (stage) => stages.push(stage),
    request.make,
  );
  assert.equal(request.method, 'PUT');
  assert.equal(request.body, body);
  assert.equal(request.withCredentials, true);
  assert.equal(request.timeout, 120000);
  assert.deepEqual(stages, [{ kind: 'sending' }]);
  const lateProgress = request.upload.onprogress!;
  lateProgress({ loaded: 25, total: 100, lengthComputable: true });
  assert.deepEqual(stages.at(-1), { kind: 'sending', percent: 25 });
  lateProgress({ loaded: 90, total: 0, lengthComputable: false });
  assert.deepEqual(stages.at(-1), { kind: 'sending', percent: undefined });
  lateProgress({ loaded: 100, total: 100, lengthComputable: true });
  assert.deepEqual(stages.at(-1), { kind: 'sending', percent: 100 });
  request.upload.onload!();
  assert.deepEqual(stages.at(-1), { kind: 'checking' });
  let resolved = false;
  result.then(() => {
    resolved = true;
  });
  await Promise.resolve();
  assert.equal(resolved, false);
  request.status = 200;
  request.responseText = JSON.stringify({ code: 'videoreplaced', sha256: 'a'.repeat(64) });
  request.onload!();
  assert.equal((await result).ok, true);
  const count = stages.length;
  lateProgress({ loaded: 100, total: 100, lengthComputable: true });
  assert.equal(stages.length, count, 'Late upload events cannot regress a completed request');
  assert.equal(request.upload.onprogress, null);
});
test('HTTP conflict remains an application failure instead of a network success', async () => {
  const request = new RequestFixture();
  const result = sendVideoUpload(
    '/learn/fixture/video',
    new FormData(),
    'POST',
    () => {},
    request.make,
  );
  request.status = 409;
  request.responseText = '{"code":"videostale"}';
  request.onload!();
  assert.deepEqual(await result, { ok: false, code: 'videostale', sha256: undefined });
});
test('timeout, connection loss, abort and invalid server responses reject without late success', async () => {
  for (const kind of ['timeout', 'network', 'abort', 'response'] as const) {
    const request = new RequestFixture();
    const result = sendVideoUpload(
      '/learn/fixture/video',
      new FormData(),
      'POST',
      () => {},
      request.make,
    );
    const lateLoad = request.onload!;
    if (kind === 'response') {
      request.status = 200;
      request.responseText = '<html>Sign in</html>';
      request.onload!();
    } else if (kind === 'timeout') request.ontimeout!();
    else if (kind === 'abort') request.onabort!();
    else request.onerror!();
    await assert.rejects(
      result,
      (error: unknown) =>
        error instanceof VideoUploadError && error.kind === (kind === 'abort' ? 'network' : kind),
    );
    request.status = 201;
    request.responseText = '{"code":"videouploaded"}';
    lateLoad();
    assert.equal(request.onload, null);
  }
});
