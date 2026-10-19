import { currentUser } from '@/lib/auth';
import { byteRange, readMaterial } from '@/lib/materials';

export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const data = await readMaterial((await params).id, user?.id);
  if (!data)
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  const { material, buffer } = data;
  const download =
    new URL(request.url).searchParams.get('download') === '1' || material.kind === 'docx';
  const headers = new Headers({
    'Content-Type':
      material.kind === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="document.${material.kind}"; filename*=UTF-8''${encodeURIComponent(material.original_name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`,
    'Cache-Control': 'private, no-store',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  });
  const range = byteRange(request.headers.get('range'), buffer.length);
  if (range === null) {
    headers.set('Content-Range', `bytes */${buffer.length}`);
    return new Response(null, { status: 416, headers });
  }
  const start = range?.start || 0;
  const end = range?.end ?? buffer.length - 1;
  headers.set('Content-Length', String(end - start + 1));
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${buffer.length}`);
  return new Response(new Uint8Array(buffer.subarray(start, end + 1)), {
    status: range ? 206 : 200,
    headers,
  });
}
