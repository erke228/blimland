import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { managedCourse, managedLectureCover } from '@/lib/course-editor';
import { MAX_COVER_BYTES, uploadCourseCover } from '@/lib/course-covers';
import { ManagementError } from '@/lib/management';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!['teacher', 'admin'].includes(user.role)) return new Response('Forbidden', { status: 403 });
  if (request.headers.get('origin') !== (process.env.APP_ORIGIN || new URL(request.url).origin))
    return new Response('Forbidden', { status: 403 });
  const limit = MAX_COVER_BYTES + 64 * 1024;
  if (Number(request.headers.get('content-length') || 0) > limit)
    return new Response('5 МБ лимиті', { status: 413 });
  let courseId = '';
  let lessonId = '';
  try {
    if (!request.body || !request.headers.get('content-type')?.startsWith('multipart/form-data;'))
      throw new ManagementError('coverinvalid');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return new Response('5 МБ лимиті', { status: 413 });
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': request.headers.get('content-type')! },
    }).formData();
    courseId = String(form.get('courseId') || '');
    lessonId = String(form.get('lessonId') || '');
    managedCourse(user.id, courseId, false);
    if (lessonId) managedLectureCover(user.id, courseId, lessonId);
    const file = form.get('file');
    if (!(file instanceof File)) throw new ManagementError('coverinvalid');
    await uploadCourseCover(
      user.id,
      courseId,
      Buffer.from(await file.arrayBuffer()),
      lessonId || undefined,
    );
    return NextResponse.redirect(
      new URL(
        `/teacher/courses/${courseId}?success=saved${lessonId ? `&lesson=${lessonId}#lecture-cover` : '#cover'}`,
        request.url,
      ),
      303,
    );
  } catch (error) {
    if (!(error instanceof ManagementError)) throw error;
    if (error.code === 'forbidden') return new Response('Forbidden', { status: 403 });
    if (!/^[a-zA-Z0-9-]+$/.test(courseId)) return new Response('Invalid course', { status: 400 });
    return NextResponse.redirect(
      new URL(
        `/teacher/courses/${courseId}?error=${error.code}${/^[a-zA-Z0-9-]+$/.test(lessonId) ? `&lesson=${lessonId}#lecture-cover` : '#cover'}`,
        request.url,
      ),
      303,
    );
  }
}
