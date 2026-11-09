export type VideoUploadStage = { kind: 'sending'; percent?: number } | { kind: 'checking' };
export class VideoUploadError extends Error {
  constructor(public kind: 'network' | 'timeout' | 'response') {
    super(`Video upload ${kind}`);
  }
}
export function sendVideoUpload(
  url: string,
  body: FormData,
  method: 'POST' | 'PUT',
  onStage: (stage: VideoUploadStage) => void,
  makeRequest: () => XMLHttpRequest = () => new XMLHttpRequest(),
): Promise<{ ok: boolean; code: string; sha256?: string }> {
  return new Promise((resolve, reject) => {
    const request = makeRequest();
    let settled = false;
    function finish(error?: VideoUploadError) {
      if (settled) return false;
      settled = true;
      request.onload = request.onerror = request.ontimeout = request.onabort = null;
      request.upload.onprogress = request.upload.onload = null;
      if (error) reject(error);
      return true;
    }
    request.open(method, url, true);
    request.withCredentials = true;
    request.timeout = 120000;
    request.upload.onprogress = (event) => {
      if (settled) return;
      onStage({
        kind: 'sending',
        percent:
          event.lengthComputable && event.total > 0
            ? Math.max(0, Math.min(100, Math.floor((event.loaded / event.total) * 100)))
            : undefined,
      });
    };
    request.upload.onload = () => {
      if (!settled) onStage({ kind: 'checking' });
    };
    request.onload = () => {
      if (settled) return;
      try {
        const data: unknown = JSON.parse(request.responseText);
        if (!data || typeof data !== 'object' || !('code' in data) || typeof data.code !== 'string')
          throw new VideoUploadError('response');
        const sha256 =
          'sha256' in data && typeof data.sha256 === 'string' ? data.sha256 : undefined;
        if (finish())
          resolve({ ok: request.status >= 200 && request.status < 300, code: data.code, sha256 });
      } catch {
        finish(new VideoUploadError('response'));
      }
    };
    request.onerror = () => {
      finish(new VideoUploadError('network'));
    };
    request.ontimeout = () => {
      finish(new VideoUploadError('timeout'));
    };
    request.onabort = () => {
      finish(new VideoUploadError('network'));
    };
    onStage({ kind: 'sending' });
    try {
      request.send(body);
    } catch {
      finish(new VideoUploadError('network'));
    }
  });
}
