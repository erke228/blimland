import { randomUUID } from 'node:crypto';
import { putStored, getStored, deleteStored } from './storage';
import { resolve, basename } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { all, one, run, transaction } from './db';
import { actor, recordAudit, ManagementError } from './management';
import { convertDocx } from './document-conversion';
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export type Material = {
  id: string;
  original_name: string;
  kind: 'pdf' | 'docx';
  size_bytes: number;
  page_count: number | null;
  preview_warning: number;
  removed_at: number | null;
};
type LessonAccess = {
  id: string;
  course_id: string;
  owner_id: string;
  status: string;
  is_preview: number;
  section_removed: number;
};
export async function lessonAccess(lessonId: string) {
  return await one<LessonAccess>(
    'SELECT l.id, s.course_id, c.owner_id, c.status, l.is_preview, EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id) section_removed FROM lessons l JOIN sections s ON s.id = l.section_id JOIN courses c ON c.id = s.course_id WHERE l.id = ?',
    lessonId,
  );
}
export async function canReadLesson(lessonId: string, viewerId?: string) {
  const lesson = await lessonAccess(lessonId);
  if (!lesson) return false;
  const viewer = viewerId ? await actor(viewerId) : undefined;
  if (viewer && (viewer.role === 'admin' || lesson.owner_id === viewer.id)) return true;
  return (
    !lesson.section_removed &&
    lesson.status === 'published' &&
    (!!lesson.is_preview ||
      (!!viewer &&
        !!(await one(
          'SELECT user_id FROM enrollments WHERE course_id = ? AND user_id = ?',
          lesson.course_id,
          viewer.id,
        ))))
  );
}
export async function editableLesson(viewerId: string, lessonId: string) {
  const viewer = await actor(viewerId, ['teacher', 'admin']);
  const lesson = await lessonAccess(lessonId);
  if (!lesson || (viewer.role !== 'admin' && lesson.owner_id !== viewer.id))
    throw new ManagementError('forbidden');
  if (lesson.status !== 'draft' || lesson.section_removed) throw new ManagementError('readonly');
  return lesson;
}
export async function listMaterials(lessonId: string, viewerId?: string, includeRemoved = false) {
  if (!(await canReadLesson(lessonId, viewerId))) throw new ManagementError('forbidden');
  if (includeRemoved) await editableLesson(viewerId || '', lessonId);
  return (
    await all<Material>(
      `SELECT id, original_name, kind, size_bytes, page_count, preview_warning, removed_at FROM lesson_materials WHERE lesson_id = ? ${includeRemoved ? '' : 'AND removed_at IS NULL'} ORDER BY created_at, id`,
      lessonId,
    )
  ).map((material) => ({ ...material }));
}
export function materialPath(key: string, preview = false) {
  if (!/^[a-f0-9-]{36}\.(pdf|docx)$/.test(key)) throw new ManagementError('documentinvalid');
  return resolve(
    /* turbopackIgnore: true */ process.env.UPLOAD_DIR || './uploads/materials',
    key + (preview ? '.html' : ''),
  );
}
export async function addMaterial(
  viewerId: string,
  lessonId: string,
  name: string,
  buffer: Buffer,
) {
  await editableLesson(viewerId, lessonId);
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES)
    throw new ManagementError('documentsize');
  const kind = name.toLowerCase().endsWith('.pdf')
    ? 'pdf'
    : name.toLowerCase().endsWith('.docx')
      ? 'docx'
      : undefined;
  if (!kind) throw new ManagementError('documenttype');
  let pages: number | null = null;
  let preview:
    | {
        html: string;
        warning: boolean;
      }
    | undefined;
  try {
    if (kind === 'pdf') {
      if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('header');
      const pdf = await PDFDocument.load(buffer, { updateMetadata: false });
      pages = pdf.getPageCount();
      if (!pages || pages > 1000) throw new Error('pages');
    } else preview = await convertDocx(buffer);
  } catch {
    throw new ManagementError('documentinvalid');
  }
  const id = randomUUID();
  const key = `${id}.${kind}`;
  const path = materialPath(key);
  await putStored(
    `materials/${key}`,
    path,
    buffer,
    kind === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  try {
    if (preview)
      await putStored(
        `materials/${key}.html`,
        materialPath(key, true),
        preview.html,
        'text/html; charset=utf-8',
      );
    await transaction(async () => {
      await editableLesson(viewerId, lessonId); // Permissions may have changed while parsing.
      const count = (await one<{
        n: number;
      }>(
        'SELECT COUNT(*) n FROM lesson_materials WHERE lesson_id = ? AND removed_at IS NULL',
        lessonId,
      ))!.n;
      const total = (await one<{
        n: number;
      }>(
        'SELECT COALESCE(SUM(size_bytes),0) n FROM lesson_materials WHERE created_by = ?',
        viewerId,
      ))!.n;
      if (count >= 10 || total + buffer.length > 500 * 1024 * 1024)
        throw new ManagementError('documentquota');
      const filename =
        basename(name.replaceAll('\\', '/'))
          .replace(/[\x00-\x1f\x7f]/g, '')
          .slice(0, 180) || `document.${kind}`;
      await run(
        'INSERT INTO lesson_materials VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)',
        id,
        lessonId,
        filename,
        key,
        kind,
        buffer.length,
        pages,
        preview?.warning ? 1 : 0,
        viewerId,
        Date.now(),
      );
      await recordAudit(viewerId, 'lesson.material_uploaded', id);
    });
  } catch (error) {
    await deleteStored(`materials/${key}`, path).catch(() => {});
    if (preview)
      await deleteStored(`materials/${key}.html`, materialPath(key, true)).catch(() => {});
    throw error;
  }
  return id;
}
export async function setMaterialRemoved(viewerId: string, id: string, removed: boolean) {
  const material = await one<{
    lesson_id: string;
  }>('SELECT lesson_id FROM lesson_materials WHERE id = ?', id);
  if (!material) throw new ManagementError('forbidden');
  await editableLesson(viewerId, material.lesson_id);
  await transaction(async () => {
    if (
      !removed &&
      (await one<{
        n: number;
      }>(
        'SELECT COUNT(*) n FROM lesson_materials WHERE lesson_id = ? AND removed_at IS NULL',
        material.lesson_id,
      ))!.n >= 10
    )
      throw new ManagementError('documentquota');
    await run(
      'UPDATE lesson_materials SET removed_at = ? WHERE id = ?',
      removed ? Date.now() : null,
      id,
    );
    await recordAudit(
      viewerId,
      removed ? 'lesson.material_removed' : 'lesson.material_restored',
      id,
    );
  });
  return material.lesson_id;
}
export async function readableMaterial(id: string, viewerId?: string) {
  const material = await one<
    Material & {
      lesson_id: string;
      storage_key: string;
    }
  >('SELECT * FROM lesson_materials WHERE id = ? AND removed_at IS NULL', id);
  if (!material || !(await canReadLesson(material.lesson_id, viewerId))) return undefined;
  return material;
}
export async function readMaterial(id: string, viewerId?: string, preview = false) {
  const material = await readableMaterial(id, viewerId);
  if (!material || (preview && material.kind !== 'docx')) return undefined;
  try {
    return {
      material,
      buffer: await getStored(
        `materials/${material.storage_key}${preview ? '.html' : ''}`,
        materialPath(material.storage_key, preview),
      ),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
export function byteRange(header: string | null, size: number) {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(size - 1, Number(match[2])) : size - 1) : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start < size &&
    end >= start
    ? { start, end }
    : null;
}
