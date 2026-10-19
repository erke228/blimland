import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
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
};
export function lessonAccess(lessonId: string) {
  return one<LessonAccess>(
    'SELECT l.id, s.course_id, c.owner_id, c.status, l.is_preview FROM lessons l JOIN sections s ON s.id = l.section_id JOIN courses c ON c.id = s.course_id WHERE l.id = ?',
    lessonId,
  );
}
export function canReadLesson(lessonId: string, viewerId?: string) {
  const lesson = lessonAccess(lessonId);
  if (!lesson) return false;
  const viewer = viewerId ? actor(viewerId) : undefined;
  if (viewer && (viewer.role === 'admin' || lesson.owner_id === viewer.id)) return true;
  return (
    lesson.status === 'published' &&
    (!!lesson.is_preview ||
      (!!viewer &&
        !!one(
          'SELECT user_id FROM enrollments WHERE course_id = ? AND user_id = ?',
          lesson.course_id,
          viewer.id,
        )))
  );
}
export function editableLesson(viewerId: string, lessonId: string) {
  const viewer = actor(viewerId, ['teacher', 'admin']);
  const lesson = lessonAccess(lessonId);
  if (!lesson || (viewer.role !== 'admin' && lesson.owner_id !== viewer.id))
    throw new ManagementError('forbidden');
  if (lesson.status !== 'draft') throw new ManagementError('readonly');
  return lesson;
}
export function listMaterials(lessonId: string, viewerId?: string, includeRemoved = false) {
  if (!canReadLesson(lessonId, viewerId)) throw new ManagementError('forbidden');
  if (includeRemoved) editableLesson(viewerId || '', lessonId);
  return all<Material>(
    `SELECT id, original_name, kind, size_bytes, page_count, preview_warning, removed_at FROM lesson_materials WHERE lesson_id = ? ${includeRemoved ? '' : 'AND removed_at IS NULL'} ORDER BY created_at, id`,
    lessonId,
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
  editableLesson(viewerId, lessonId);
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES)
    throw new ManagementError('documentsize');
  const kind = name.toLowerCase().endsWith('.pdf')
    ? 'pdf'
    : name.toLowerCase().endsWith('.docx')
      ? 'docx'
      : undefined;
  if (!kind) throw new ManagementError('documenttype');
  let pages: number | null = null;
  let preview: { html: string; warning: boolean } | undefined;
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
  await mkdir(
    resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || './uploads/materials'),
    { recursive: true },
  );
  await writeFile(path, buffer, { flag: 'wx' });
  try {
    if (preview) await writeFile(materialPath(key, true), preview.html, { flag: 'wx' });
    transaction(() => {
      editableLesson(viewerId, lessonId); // Permissions may have changed while parsing.
      const count = one<{ n: number }>(
        'SELECT COUNT(*) n FROM lesson_materials WHERE lesson_id = ? AND removed_at IS NULL',
        lessonId,
      )!.n;
      const total = one<{ n: number }>(
        'SELECT COALESCE(SUM(size_bytes),0) n FROM lesson_materials WHERE created_by = ?',
        viewerId,
      )!.n;
      if (count >= 10 || total + buffer.length > 500 * 1024 * 1024)
        throw new ManagementError('documentquota');
      const filename =
        basename(name.replaceAll('\\', '/'))
          .replace(/[\x00-\x1f\x7f]/g, '')
          .slice(0, 180) || `document.${kind}`;
      run(
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
      recordAudit(viewerId, 'lesson.material_uploaded', id);
    });
  } catch (error) {
    await unlink(path).catch(() => {});
    if (preview) await unlink(materialPath(key, true)).catch(() => {});
    throw error;
  }
  return id;
}
export function setMaterialRemoved(viewerId: string, id: string, removed: boolean) {
  const material = one<{ lesson_id: string }>(
    'SELECT lesson_id FROM lesson_materials WHERE id = ?',
    id,
  );
  if (!material) throw new ManagementError('forbidden');
  editableLesson(viewerId, material.lesson_id);
  transaction(() => {
    if (
      !removed &&
      one<{ n: number }>(
        'SELECT COUNT(*) n FROM lesson_materials WHERE lesson_id = ? AND removed_at IS NULL',
        material.lesson_id,
      )!.n >= 10
    )
      throw new ManagementError('documentquota');
    run('UPDATE lesson_materials SET removed_at = ? WHERE id = ?', removed ? Date.now() : null, id);
    recordAudit(viewerId, removed ? 'lesson.material_removed' : 'lesson.material_restored', id);
  });
  return material.lesson_id;
}
export function readableMaterial(id: string, viewerId?: string) {
  const material = one<Material & { lesson_id: string; storage_key: string }>(
    'SELECT * FROM lesson_materials WHERE id = ? AND removed_at IS NULL',
    id,
  );
  if (!material || !canReadLesson(material.lesson_id, viewerId)) return undefined;
  return material;
}
export async function readMaterial(id: string, viewerId?: string, preview = false) {
  const material = readableMaterial(id, viewerId);
  if (!material || (preview && material.kind !== 'docx')) return undefined;
  try {
    return {
      material,
      buffer: await readFile(
        /* turbopackIgnore: true */ materialPath(material.storage_key, preview),
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
