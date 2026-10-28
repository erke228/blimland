import { currentUser } from '@/lib/auth';
import { readCourseCover } from '@/lib/course-covers';
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
  const { id } = await params;
  const user = await currentUser();
  const buffer = await readCourseCover(id, user?.id);
  if (!buffer) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, no-store',
      'Content-Length': String(buffer.length),
    },
  });
}
