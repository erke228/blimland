import { currentUser } from '@/lib/auth';
import {
  readableVideo,
  hasLessonVideo,
  saveLessonVideo,
  MAX_VIDEO_UPLOAD_BYTES,
  replaceLessonVideo,
} from '@/lib/lesson-videos';
import { byteRange, editableLesson } from '@/lib/materials';
import { boundedForm, sameOrigin, UploadRequestError } from '@/lib/http-upload';
import { ManagementError } from '@/lib/management';
import { mp4DurationMs } from '@/lib/mp4-metadata';
import { createHash } from 'node:crypto';
import { one } from '@/lib/db';
export const runtime = 'nodejs';
function result(status: number, code: string, extra: Record<string, number | string> = {}) {
  return Response.json(
    { code, ...extra },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return uploadVideo(request, context, false);
}
export async function PUT(request: Request, context: Context) {
  return uploadVideo(request, context, true);
}
async function uploadVideo(request: Request, { params }: Context, replacing: boolean) {
  const user = await currentUser();
  if (!user) return result(401, 'unauthorized');
  if (!['teacher', 'admin'].includes(user.role) || !sameOrigin(request))
    return result(403, 'forbidden');
  const { id } = await params;
  try {
    await editableLesson(user.id, id);
    const form = await boundedForm(request, MAX_VIDEO_UPLOAD_BYTES + 65536);
    const expected = form.get('expectedSha256');
    if (replacing && form.get('confirmReplace') !== 'yes') return result(400, 'videoconfirm');
    if (replacing && (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)))
      return result(400, 'videoinvalid');
    const file = form.get('file');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.mp4') || !file.size)
      return result(400, 'videoinvalid');
    if (file.size > MAX_VIDEO_UPLOAD_BYTES) return result(413, 'videolarge');
    const bytes = Buffer.from(await file.arrayBuffer());
    let duration: number;
    try {
      duration = mp4DurationMs(bytes);
    } catch {
      return result(400, 'videoinvalid');
    }
    if (duration > 90000) return result(400, 'videolong');
    if (replacing) {
      await replaceLessonVideo(user.id, id, bytes, expected as string);
      return result(200, 'videoreplaced', {
        durationMs: duration,
        sizeBytes: file.size,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    const existing = await one<{ sha256: string; duration_ms: number; size_bytes: number }>(
      'SELECT sha256,duration_ms,size_bytes FROM lesson_videos WHERE lesson_id=?',
      id,
    );
    if (existing) {
      if (existing.sha256 !== createHash('sha256').update(bytes).digest('hex'))
        return result(409, 'videoexists');
      // A lost success response can be retried without replacing the object or auditing twice.
      await editableLesson(user.id, id);
      return result(200, 'videouploaded', {
        durationMs: existing.duration_ms,
        sizeBytes: existing.size_bytes,
        sha256: existing.sha256,
      });
    }
    // Client userId, duration and grades are deliberately ignored.
    await saveLessonVideo(user.id, id, bytes, duration, 'web-upload');
    return result(201, 'videouploaded', {
      durationMs: duration,
      sizeBytes: file.size,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  } catch (error) {
    if (error instanceof UploadRequestError)
      return result(error.status, error.status === 413 ? 'videolarge' : 'videoinvalid');
    if (error instanceof ManagementError)
      return result(
        ['readonly', 'videoquota', 'videostale'].includes(error.code) ? 409 : 403,
        error.code,
      );
    // A concurrent upload may have won; never overwrite it or report a false success.
    if (!replacing && (await hasLessonVideo(id))) return result(409, 'videoexists');
    return result(503, 'videounavailable');
  }
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const data = await readableVideo((await params).id, user?.id);
  if (!data)
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  if (data.url)
    return new Response(null, {
      status: 302,
      headers: { Location: data.url, 'Cache-Control': 'private, no-store' },
    });
  const buffer = data.buffer!;
  const range = byteRange(request.headers.get('range'), buffer.length);
  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (range === null) {
    headers.set('Content-Range', `bytes */${buffer.length}`);
    return new Response(null, { status: 416, headers });
  }
  const start = range?.start ?? 0,
    end = range?.end ?? buffer.length - 1;
  headers.set('Content-Length', String(end - start + 1));
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${buffer.length}`);
  return new Response(new Uint8Array(buffer.subarray(start, end + 1)), {
    status: range ? 206 : 200,
    headers,
  });
}
