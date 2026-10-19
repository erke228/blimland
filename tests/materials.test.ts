import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { migrate, one, run } from '../src/lib/db';
import {
  addMaterial,
  readMaterial,
  listMaterials,
  materialPath,
  setMaterialRemoved,
  byteRange,
} from '../src/lib/materials';
import { safeDocumentHtml, validateDocxArchive } from '../src/lib/document-conversion';
import { ManagementError } from '../src/lib/management';
import { docxFixture, pdfFixture } from './document-fixtures';
process.env.DATABASE_PATH = ':memory:';
process.env.UPLOAD_DIR = resolve('.test-data', `materials-${randomUUID()}`);
migrate();
function user(role = 'student') {
  const id = randomUUID();
  run(
    'INSERT INTO users (id,email,name,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',
    id,
    `${id}@test.invalid`,
    'Үлгі',
    'unused',
    role,
    Date.now(),
  );
  return id;
}
const teacher = user('teacher');
const student = user();
const foreign = user('teacher');
const admin = user('admin');
function lesson(preview = 0) {
  const id = randomUUID();
  run(
    'INSERT INTO courses VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id,
    teacher,
    'Course',
    'Description',
    'Технология',
    'Орташа',
    0,
    'draft',
    'teal',
    Date.now(),
    Date.now(),
  );
  run('INSERT INTO sections VALUES (?,?,?,?)', id, id, 'Section', 0);
  run('INSERT INTO lessons VALUES (?,?,?,?,?,?,?,?)', id, id, 'Lesson', 'Text', '', 10, 0, preview);
  return id;
}
const code = (expected: string) => (error: unknown) =>
  error instanceof ManagementError && error.code === expected;
test('PDF is stored privately and requires current lesson access on every request', async () => {
  const id = lesson();
  const bytes = await pdfFixture();
  const file = await addMaterial(teacher, id, 'дәріс.pdf', bytes);
  assert.equal((await readMaterial(file, teacher))?.material.page_count, 1);
  assert((await readMaterial(file, admin))?.buffer.equals(bytes));
  assert.equal(await readMaterial(file), undefined);
  assert.equal(await readMaterial(file, student), undefined);
  assert.equal(await readMaterial(file, foreign), undefined);
  assert.throws(() => listMaterials(id, student), code('forbidden'));
  run("UPDATE courses SET status = 'published' WHERE id = ?", id);
  run('INSERT INTO enrollments VALUES (?,?,?)', student, id, Date.now());
  assert((await readMaterial(file, student))?.buffer.equals(bytes));
  assert(!JSON.stringify(listMaterials(id, student)).includes('storage_key'));
  assert.equal(Object.getPrototypeOf(listMaterials(id, student)[0]), Object.prototype);
  run("UPDATE courses SET status = 'archived' WHERE id = ?", id);
  assert.equal(await readMaterial(file, student), undefined);
});
test('A public preview is readable only once the course is published', async () => {
  const id = lesson(1);
  const file = await addMaterial(teacher, id, 'open.pdf', await pdfFixture());
  assert.equal(await readMaterial(file), undefined);
  run("UPDATE courses SET status = 'published' WHERE id = ?", id);
  assert(await readMaterial(file));
  await assert.rejects(addMaterial(teacher, id, 'new.pdf', await pdfFixture()), code('readonly'));
});
test('Students and foreign teachers cannot upload, detach or restore documents', async () => {
  const id = lesson();
  const bytes = await pdfFixture();
  await assert.rejects(addMaterial(student, id, 'x.pdf', bytes), code('forbidden'));
  await assert.rejects(addMaterial(foreign, id, 'x.pdf', bytes), code('forbidden'));
  const file = await addMaterial(teacher, id, 'x.pdf', bytes);
  assert.throws(() => setMaterialRemoved(student, file, true), code('forbidden'));
  assert.throws(() => setMaterialRemoved(foreign, file, true), code('forbidden'));
  setMaterialRemoved(teacher, file, true);
  assert.equal(await readMaterial(file, teacher), undefined);
  setMaterialRemoved(admin, file, false);
  assert(await readMaterial(file, teacher));
});
test('Rejects invalid, oversized, disguised, legacy Word and path traversal inputs', async () => {
  const id = lesson();
  await assert.rejects(addMaterial(teacher, id, 'x.pdf', Buffer.alloc(0)), code('documentsize'));
  await assert.rejects(
    addMaterial(teacher, id, 'x.pdf', Buffer.alloc(20 * 1024 * 1024 + 1)),
    code('documentsize'),
  );
  await assert.rejects(
    addMaterial(teacher, id, 'x.pdf', Buffer.from('%PDF-invalid')),
    code('documentinvalid'),
  );
  await assert.rejects(
    addMaterial(teacher, id, 'x.doc', Buffer.from('Word')),
    code('documenttype'),
  );
  await assert.rejects(
    addMaterial(teacher, id, 'x.docx', Buffer.from('not-a-zip')),
    code('documentinvalid'),
  );
  assert.throws(() => materialPath('../../private.sqlite'), code('documentinvalid'));
});
test('Word preview preserves Kazakh text and tables, strips executable links and has protected access', async () => {
  const id = lesson();
  const file = await addMaterial(teacher, id, 'Қазақша.docx', await docxFixture(true));
  const preview = await readMaterial(file, teacher, true);
  assert(preview);
  assert(preview.buffer.toString().includes('Ә Ғ Қ Ң Ө Ұ Ү Һ І'));
  assert(preview.buffer.toString().includes('<table>'));
  assert(!preview.buffer.toString().includes('javascript:'));
  assert.equal(await readMaterial(file, student, true), undefined);
  assert.equal(await readMaterial(file), undefined);
});
test('Sanitizer removes scripts, external tracking images, styles, SVG and active attributes', () => {
  const html = safeDocumentHtml(
    '<script>alert(1)</script><img src="https://evil.invalid/track" onerror="alert(1)"><img src="data:image/svg+xml;base64,AAA"><p style="background:url(https://evil.invalid)" onclick="alert(1)">Сабақ</p><iframe src="https://evil.invalid"></iframe>',
  );
  assert.equal(html, '<p>Сабақ</p>');
});
test('ZIP content must actually be a Word document and cannot contain macros', async () => {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('not-word.txt', 'x');
  await assert.rejects(
    validateDocxArchive(await zip.generateAsync({ type: 'nodebuffer' })),
    code('documentinvalid'),
  );
  zip.file('[Content_Types].xml', 'x');
  zip.file('word/document.xml', 'x');
  zip.file('word/vbaProject.bin', 'x');
  await assert.rejects(
    validateDocxArchive(await zip.generateAsync({ type: 'nodebuffer' })),
    code('documentinvalid'),
  );
});
test('Range handling supports normal, suffix and open ranges and rejects invalid requests', () => {
  assert.deepEqual(byteRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(byteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange('bytes=10-', 100), { start: 10, end: 99 });
  for (const value of ['bytes=100-', 'bytes=9-2', 'bytes=-0', 'bytes=0-1,4-5', 'invalid'])
    assert.equal(byteRange(value, 100), null);
  assert.equal(byteRange(null, 100), undefined);
});
