import { one } from './db';
import { ManagementError } from './management';

export function directVideoUploadsEnabled() {
  return process.env.DIRECT_VIDEO_UPLOAD_ENABLED === 'true';
}
function courseQuotaBytes() {
  const value = process.env.VIDEO_COURSE_QUOTA_BYTES?.trim() || '0';
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error('VIDEO_COURSE_QUOTA_BYTES must be a nonnegative integer.');
  return Number(value);
}
export async function checkCourseVideoQuota(
  courseId: string,
  incomingBytes: number,
  excludeReservation = '',
) {
  const limit = courseQuotaBytes();
  if (!limit) return;
  const usage = (await one<{ bytes: number }>(
    `SELECT COALESCE(SUM(v.size_bytes),0) bytes FROM lesson_videos v
     JOIN lessons l ON l.id=v.lesson_id JOIN sections s ON s.id=l.section_id WHERE s.course_id=?`,
    courseId,
  ))!.bytes;
  const reserved = directVideoUploadsEnabled()
    ? (await one<{ bytes: number }>(
        `SELECT COALESCE(SUM(expected_bytes),0) bytes FROM direct_video_uploads
       WHERE course_id=? AND state='pending' AND expires_at>? AND id<>?`,
        courseId,
        Date.now(),
        excludeReservation,
      ))!.bytes
    : 0;
  if (usage + reserved + incomingBytes > limit) throw new ManagementError('videoquota');
}
