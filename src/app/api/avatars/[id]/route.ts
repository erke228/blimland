import { currentUser } from '@/lib/auth';
import { canReadAvatar } from '@/lib/avatar-access';
import { readOwnAvatar } from '@/lib/profile';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const headers = {
    'Cache-Control': 'private, no-store',
    Vary: 'Cookie',
    'X-Content-Type-Options': 'nosniff',
  };
  if (!(await canReadAvatar(id, user?.id)))
    return new Response('Not found', { status: 404, headers });
  const bytes = await readOwnAvatar(id);
  if (!bytes) return new Response('Not found', { status: 404, headers });
  return new Response(new Uint8Array(bytes), {
    headers: { ...headers, 'Content-Type': 'image/webp' },
  });
}
