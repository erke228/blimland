import { currentUser } from '@/lib/auth';
import { readMaterial } from '@/lib/materials';
export const runtime = 'nodejs';
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const user = await currentUser();
  const data = await readMaterial((await params).id, user?.id, true);
  if (!data)
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  const html = `<!doctype html><html lang="kk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Word құжаты</title><style>body{font-family:Arial,sans-serif;color:#263c34;max-width:800px;margin:auto;padding:28px 22px;line-height:1.85;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;display:block;overflow:auto}td,th{padding:8px;border:1px solid #dbe5df}pre{white-space:pre-wrap}a{color:#357556}h1,h2,h3{line-height:1.5}p{margin:0 0 1em}</style><body>${data.buffer.toString('utf8')}</body></html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy':
        "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
