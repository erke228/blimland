import { all } from './db';
import { actor } from './management';
import { courseLessons, getCourse } from './courses';
export async function teachingProfileCourses(viewerId: string) {
  const user = await actor(viewerId, ['teacher', 'admin']);
  return await Promise.all(
    (
      await all<{
        id: string;
      }>(
        "SELECT c.id FROM courses c WHERE c.owner_id=? AND c.status!='archived' AND NOT EXISTS(SELECT 1 FROM course_trash t WHERE t.course_id=c.id) ORDER BY c.updated_at DESC",
        user.id,
      )
    ).map(async ({ id }) => ({
      course: (await getCourse(id))!,
      lessons: (await courseLessons(id)).map((l) => ({
        id: l.id,
        title: l.title,
        duration_minutes: l.duration_minutes,
      })),
    })),
  );
}
