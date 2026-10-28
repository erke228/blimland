import { currentUser } from '@/lib/auth';
import { one } from '@/lib/db';
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
  const lesson = await one<{
    course_id: string;
  }>('SELECT s.course_id FROM lessons l JOIN sections s ON s.id=l.section_id WHERE l.id=?', id);
  if (!lesson) return new Response('Not found', { status: 404 });
  const user = await currentUser();
  const bytes = await readCourseCover(lesson.course_id, user?.id, id);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store' },
  });
}
