import { currentUser } from '@/lib/auth';
import { boundedForm, sameOrigin, UploadRequestError } from '@/lib/http-upload';
import { ManagementError } from '@/lib/management';
import { saveVideoPosition } from '@/lib/video-progress';

export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  try {
    const form = await boundedForm(request, 2048);
    const input = form.get('position');
    if (typeof input !== 'string' || !input.trim())
      return new Response('Invalid position', { status: 400 });
    await saveVideoPosition(user.id, (await params).id, Number(input));
  } catch (error) {
    if (error instanceof UploadRequestError)
      return new Response('Invalid request', { status: error.status });
    if (error instanceof ManagementError)
      return new Response('Cannot save position', { status: error.code === 'invalid' ? 400 : 403 });
    throw error;
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
}
