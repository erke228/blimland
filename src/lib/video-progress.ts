import { one, run } from './db';
import { ManagementError } from './management';

// Reading published videos is public; personal resume state requires active enrollment.
const eligibleVideo = `FROM lessons l
  JOIN sections s ON s.id=l.section_id
  JOIN courses c ON c.id=s.course_id
  JOIN enrollments e ON e.course_id=c.id AND e.user_id=?
  JOIN users u ON u.id=e.user_id
  LEFT JOIN lesson_videos v ON v.lesson_id=l.id
  WHERE l.id=? AND c.status='published' AND u.status='active'
  AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id)
  AND (trim(l.video_url)<>'' OR v.lesson_id IS NOT NULL)`;

export async function videoPosition(userId: string, lessonId: string) {
  const result = await one<{ video_position: number }>(
    `SELECT COALESCE((SELECT p.video_position FROM lesson_progress p
      WHERE p.user_id=e.user_id AND p.lesson_id=l.id),0) video_position ${eligibleVideo}`,
    userId,
    lessonId,
  );
  return result?.video_position ?? 0;
}

export async function saveVideoPosition(userId: string, lessonId: string, position: number) {
  if (!Number.isFinite(position) || position < 0 || position > 86400)
    throw new ManagementError('invalid');
  const seconds = Math.round(position * 10) / 10;
  // Authorization and the write share one statement. Never update completed_at or grades.
  const result = await run(
    `INSERT INTO lesson_progress(user_id,lesson_id,video_position)
     SELECT e.user_id,l.id,CASE WHEN v.duration_ms IS NOT NULL AND ? > v.duration_ms/1000.0
       THEN v.duration_ms/1000.0 ELSE ? END ${eligibleVideo}
     ON CONFLICT(user_id,lesson_id) DO UPDATE SET video_position=excluded.video_position`,
    seconds,
    seconds,
    userId,
    lessonId,
  );
  if (!result.changes) throw new ManagementError('forbidden');
}
