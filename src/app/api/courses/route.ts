import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { createCourseWithBanner } from '@/lib/course-creation';
import { boundedForm, sameOrigin, requestOrigin, UploadRequestError } from '@/lib/http-upload';
import { MAX_IMAGE_BYTES } from '@/lib/images';
import { ManagementError } from '@/lib/management';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const json = request.headers.get('accept')?.includes('application/json');
  const user = await currentUser();
  if (!user) return Response.json({ error: 'forbidden' }, { status: 401 });
  if (!['teacher', 'admin'].includes(user.role) || !sameOrigin(request))
    return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const form = await boundedForm(request, MAX_IMAGE_BYTES + 128 * 1024);
    const text = (key: string) => String(form.get(key) || '').trim();
    const file = form.get('file');
    const mode = text('coverMode') || 'preset';
    if (!['upload', 'preset'].includes(mode)) throw new ManagementError('coverinvalid');
    const bytes =
      mode === 'upload' && file instanceof File && file.name
        ? Buffer.from(await file.arrayBuffer())
        : undefined;
    const id = await createCourseWithBanner(
      user.id,
      {
        title: text('title'),
        description: text('description'),
        category: text('category'),
        level: text('level') || 'Бастапқы',
      },
      text('coverPreset') || 'books',
      bytes,
    );
    const path = `/teacher/courses/${id}`;
    return json
      ? Response.json({ redirect: path })
      : NextResponse.redirect(new URL(path, requestOrigin(request)), 303);
  } catch (error) {
    const code =
      error instanceof ManagementError
        ? error.code
        : error instanceof UploadRequestError
          ? error.status === 413
            ? 'coversize'
            : 'invalid'
          : undefined;
    if (!code) throw error;
    return json
      ? Response.json({ error: code }, { status: 400 })
      : NextResponse.redirect(new URL(`/teacher/new?error=${code}`, requestOrigin(request)), 303);
  }
}
