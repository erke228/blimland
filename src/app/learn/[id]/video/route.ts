import { currentUser } from '@/lib/auth';
import { readableVideo } from '@/lib/lesson-videos';
import { byteRange } from '@/lib/materials';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const data = await readableVideo((await params).id, user?.id);
  if (!data)
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  if (data.url)
    return new Response(null, {
      status: 302,
      headers: { Location: data.url, 'Cache-Control': 'private, no-store' },
    });
  const buffer = data.buffer!;
  const range = byteRange(request.headers.get('range'), buffer.length);
  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (range === null) {
    headers.set('Content-Range', `bytes */${buffer.length}`);
    return new Response(null, { status: 416, headers });
  }
  const start = range?.start ?? 0,
    end = range?.end ?? buffer.length - 1;
  headers.set('Content-Length', String(end - start + 1));
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${buffer.length}`);
  return new Response(new Uint8Array(buffer.subarray(start, end + 1)), {
    status: range ? 206 : 200,
    headers,
  });
}
