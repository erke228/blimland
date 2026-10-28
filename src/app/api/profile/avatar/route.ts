import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { uploadAvatar, readOwnAvatar } from '@/lib/profile';
import { boundedForm, sameOrigin, requestOrigin, UploadRequestError } from '@/lib/http-upload';
import { MAX_IMAGE_BYTES } from '@/lib/images';
import { ManagementError } from '@/lib/management';
export const runtime = 'nodejs';
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response('Not found', { status: 404 });
  const bytes = await readOwnAvatar(user.id);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store' },
  });
}
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  try {
    const form = await boundedForm(request, MAX_IMAGE_BYTES + 65536);
    const file = form.get('file');
    if (!(file instanceof File)) throw new ManagementError('coverinvalid');
    await uploadAvatar(user.id, Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof UploadRequestError)
      return new Response('Сурет 5 МБ-тан аспауы тиіс.', { status: error.status });
    if (error instanceof ManagementError)
      return NextResponse.redirect(
        new URL(`/profile?error=${error.code}`, requestOrigin(request)),
        303,
      );
    throw error;
  }
  return NextResponse.redirect(new URL('/profile?success=saved', requestOrigin(request)), 303);
}
