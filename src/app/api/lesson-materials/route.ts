import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { addMaterial, editableLesson, MAX_DOCUMENT_BYTES } from '@/lib/materials';
import { ManagementError } from '@/lib/management';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!['teacher', 'admin'].includes(user.role)) return new Response('Forbidden', { status: 403 });
  const origin = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) return new Response('Forbidden', { status: 403 });
  // Bound the actual stream too; Content-Length is controlled by the sender.
  const limit = MAX_DOCUMENT_BYTES + 64 * 1024;
  if (Number(request.headers.get('content-length') || 0) > limit)
    return new Response('Файл 20 МБ-тан аспауы тиіс.', { status: 413 });
  let lessonId = '';
  try {
    if (!request.body || !request.headers.get('content-type')?.startsWith('multipart/form-data;'))
      throw new ManagementError('documentinvalid');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return new Response('Файл 20 МБ-тан аспауы тиіс.', { status: 413 });
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': request.headers.get('content-type')! },
    }).formData();
    lessonId = String(form.get('lessonId') || '');
    const lesson = editableLesson(user.id, lessonId);
    const file = form.get('file');
    if (!(file instanceof File)) throw new ManagementError('documentinvalid');
    await addMaterial(user.id, lessonId, file.name, Buffer.from(await file.arrayBuffer()));
    return NextResponse.redirect(
      new URL(
        `/teacher/courses/${lesson.course_id}?lesson=${lessonId}&success=documentuploaded#materials`,
        request.url,
      ),
      303,
    );
  } catch (error) {
    if (error instanceof ManagementError) {
      if (error.code === 'forbidden') return new Response('Forbidden', { status: 403 });
      let courseId: string;
      try {
        courseId = editableLesson(user.id, lessonId).course_id;
      } catch {
        return new Response('Материалды жүктеу мүмкін болмады.', { status: 400 });
      }
      return NextResponse.redirect(
        new URL(
          `/teacher/courses/${courseId}?lesson=${lessonId}&error=${error.code}#materials`,
          request.url,
        ),
        303,
      );
    }
    throw error;
  }
}
