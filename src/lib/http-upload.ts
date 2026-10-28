export class UploadRequestError extends Error {
  constructor(public status: number) {
    super('Invalid upload request');
  }
}
export async function boundedForm(request: Request, limit: number) {
  if (Number(request.headers.get('content-length') || 0) > limit) throw new UploadRequestError(413);
  if (!request.body || !request.headers.get('content-type')?.startsWith('multipart/form-data;'))
    throw new UploadRequestError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new UploadRequestError(413);
    }
    chunks.push(value);
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': request.headers.get('content-type')! },
    }).formData();
  } catch {
    throw new UploadRequestError(400);
  }
}
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === requestOrigin(request);
}
export function requestOrigin(request: Request) {
  if (process.env.APP_ORIGIN) return new URL(process.env.APP_ORIGIN).origin;
  // Next may use its internal localhost URL; the browser sends the actual Host.
  // Forwarded headers are deliberately ignored without a configured public origin.
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (host) url.host = host;
  return url.origin;
}
