import { NextResponse } from 'next/server';
import { sameOrigin, requestOrigin } from '@/lib/http-upload';
import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/auth';
import { managedCourse, lessonFormInput, writeLesson } from '@/lib/course-editor';
import { addMaterial, MAX_DOCUMENT_BYTES } from '@/lib/materials';
import { ManagementError } from '@/lib/management';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!['teacher', 'admin'].includes(user.role)) return new Response('Forbidden', { status: 403 });
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const limit = MAX_DOCUMENT_BYTES + 256 * 1024;
  if (Number(request.headers.get('content-length') || 0) > limit)
    return new Response('Құжат 20 МБ-тан аспауы тиіс.', { status: 413 });
  let courseId = '',
    lessonId = '';
  try {
    if (!request.body || !request.headers.get('content-type')?.startsWith('multipart/form-data;'))
      throw new ManagementError('documentinvalid');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return new Response('Құжат 20 МБ-тан аспауы тиіс.', { status: 413 });
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': request.headers.get('content-type')! },
    }).formData();
    courseId = String(form.get('courseId') || '');
    await managedCourse(user.id, courseId);
    lessonId = String(form.get('lessonId') || '');
    lessonId = await writeLesson(user.id, courseId, lessonFormInput(form));
    const file = form.get('file');
    const hasFile = file instanceof File && !!file.name;
    if (hasFile)
      await addMaterial(user.id, lessonId, file.name, Buffer.from(await file.arrayBuffer()));
    revalidatePath(`/teacher/courses/${courseId}`);
    revalidatePath(`/learn/${lessonId}`);
    return NextResponse.redirect(
      new URL(
        `/teacher/courses/${encodeURIComponent(courseId)}?tab=${hasFile ? 'materials' : 'lecture'}&lesson=${encodeURIComponent(lessonId)}&success=${hasFile ? 'documentuploaded' : 'saved'}#${hasFile ? 'materials' : 'lesson-editor'}`,
        requestOrigin(request),
      ),
      303,
    );
  } catch (error) {
    if (!(error instanceof ManagementError)) throw error;
    if (error.code === 'forbidden') return new Response('Forbidden', { status: 403 });
    if (!courseId || !/^[a-zA-Z0-9-]+$/.test(courseId))
      return new Response('Invalid request', { status: 400 });
    const query = new URLSearchParams({
      error: error.code,
      lesson: lessonId || 'new',
      tab: lessonId ? 'materials' : 'lecture',
    });
    return NextResponse.redirect(
      new URL(`/teacher/courses/${courseId}?${query}#materials`, requestOrigin(request)),
      303,
    );
  }
}
