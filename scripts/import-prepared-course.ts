import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadEnvironment } from './postgres-environment';
import { all, one, run, transaction, usesPostgres } from '../src/lib/db';
import { actor, recordAudit } from '../src/lib/management';
import { courseLessons, getCourse } from '../src/lib/courses';
import { writeLesson, assertCourseComplete } from '../src/lib/course-editor';
import { addMaterial, materialPath } from '../src/lib/materials';
import { getStored } from '../src/lib/storage';
import { saveLessonVideo } from '../src/lib/lesson-videos';

const question = z
  .object({
    id: z.string().min(1),
    type: z.enum(['single_choice', 'short_answer']),
    question: z.string().min(3).max(3000),
    options: z.array(z.string().min(1)).min(2).max(8).optional(),
    correct_index: z.number().int().min(0).optional(),
    explanation: z.string().optional(),
    sample_answer: z.string().optional(),
    rubric: z.string().optional(),
    points: z.number().int().min(1).max(10),
  })
  .strict();
const planSchema = z
  .object({
    version: z.literal(1),
    course_id: z.string().uuid(),
    owner_id: z.string().uuid(),
    owner_name: z.string().min(1),
    course_title: z.string().min(5),
    description: z.string().min(30).max(5000),
    lectures: z
      .array(
        z
          .object({
            number: z.number().int().min(1).max(1000),
            module: z.number().int().min(1),
            title: z.string().min(3).max(180),
            body: z.string().max(30000),
            summary: z.string().max(500),
            objectives: z.string().max(3000),
            minutes: z.number().int().min(1).max(600),
            preview: z.boolean(),
            files: z
              .array(
                z
                  .object({
                    path: z.string(),
                    name: z.string().min(1).max(180),
                    sha256: z.string().regex(/^[a-f0-9]{64}$/),
                  })
                  .strict(),
              )
              .min(1)
              .max(10),
            quiz: z
              .object({
                questions: z.array(question).min(1),
                suggested_pass_points: z.number().int().min(0),
                time_minutes: z.number().int().min(1),
              })
              .strict(),
            practice: z
              .object({
                title: z.string(),
                instructions: z.string(),
                starter_code: z.string().max(30000),
                full_code: z.string().max(100000),
                requirements: z.string().max(30000),
                expected_output: z.string().max(10000),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();
const args = process.argv.slice(2),
  manifest = args.find((a) => !a.startsWith('--'));
if (!manifest)
  throw Error(
    'Usage: tsx scripts/import-prepared-course.ts path/to/site-import.json [--publish] [--videos]',
  );
loadEnvironment();
if (!usesPostgres() && !process.env.DATABASE_PATH)
  throw Error('Explicit database target required.');
const manifestPath = resolve(manifest),
  root = dirname(manifestPath);
const plan = planSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
function localFile(path: string) {
  const file = resolve(root, path),
    rel = relative(root, file);
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel))
    throw Error('Source file must stay inside preparation directory.');
  return file;
}
const owner = await actor(plan.owner_id, ['admin']);
const course = await getCourse(plan.course_id);
if (
  owner.name !== plan.owner_name ||
  !course ||
  course.owner_id !== owner.id ||
  course.title !== plan.course_title ||
  !['draft', 'published'].includes(course.status)
)
  throw Error('Existing course/owner must match the approved preparation.');
const sections = await all<{ id: string; position: number }>(
  'SELECT id,position FROM sections WHERE course_id=? AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=sections.id) ORDER BY position,id',
  course.id,
);
const existing = await courseLessons(course.id);
const seen = new Set<string>();
// Validate the complete preparation before writing any lesson. Files, keys and
// working data remain outside Git; there is no seed or on-startup import.
for (const [index, l] of plan.lectures.entries()) {
  if (l.number !== index + 1 || !sections[l.module - 1])
    throw Error('Invalid lecture/module order.');
  const identity = `${sections[l.module - 1].id}:${l.title}`;
  if (seen.has(identity)) throw Error('Duplicate lecture');
  seen.add(identity);
  const previous = existing.filter(
    (e) => e.title === l.title && e.section_id === sections[l.module - 1].id,
  );
  if (previous.length > 1) throw Error('Ambiguous existing lecture');
  if (
    previous.length &&
    (previous[0].body !== l.body ||
      previous[0].summary !== l.summary ||
      previous[0].objectives !== l.objectives ||
      !!previous[0].is_preview !== l.preview ||
      previous[0].duration_minutes !== l.minutes)
  )
    throw Error('Existing lecture was edited; refusing overwrite.');
  for (const f of l.files) {
    if (!/\.(pdf|docx)$/i.test(f.name) || /teacher|answer.?keys/i.test(f.name + ' ' + f.path))
      throw Error('Only student PDF/Word documents may be attached.');
    if (digest(await readFile(localFile(f.path))) !== f.sha256)
      throw Error(`Prepared file changed: ${f.path}`);
  }
  const total = l.quiz.questions.reduce((s, q) => s + q.points, 0);
  if (l.quiz.suggested_pass_points > total) throw Error('Invalid quiz pass score.');
  for (const q of l.quiz.questions) {
    if (
      q.type === 'single_choice' &&
      (!q.options ||
        q.correct_index === undefined ||
        q.correct_index >= q.options.length ||
        new Set(q.options).size !== q.options.length)
    )
      throw Error('Invalid choice question/key');
  }
}
if (existing.some((e) => !seen.has(`${e.section_id}:${e.title}`)))
  throw Error('The course contains unlisted lessons; refusing to overwrite or append duplicates.');
const receipt: {
  course_id: string;
  owner_id: string;
  lectures: Array<{
    number: number;
    id: string;
    materials: Array<{ id: string; name: string; sha256: string }>;
  }>;
  status?: string;
} = { course_id: course.id, owner_id: owner.id, lectures: [] };
for (const l of plan.lectures) {
  const sectionId = sections[l.module - 1].id;
  let lessonId = existing.find((e) => e.title === l.title && e.section_id === sectionId)?.id;
  if (!lessonId)
    lessonId = await writeLesson(owner.id, course.id, {
      id: '',
      sectionId,
      title: l.title,
      body: l.body,
      videoUrl: '',
      minutes: l.minutes,
      preview: l.preview,
      summary: l.summary,
      objectives: l.objectives,
    });
  const attached: Array<{ id: string; name: string; sha256: string }> = [];
  for (const f of l.files) {
    const bytes = await readFile(localFile(f.path));
    const rows = await all<{ id: string; storage_key: string; removed_at: number | null }>(
      'SELECT id,storage_key,removed_at FROM lesson_materials WHERE lesson_id=? AND original_name=?',
      lessonId,
      f.name,
    );
    if (rows.length > 1 || rows[0]?.removed_at)
      throw Error('Material was removed or duplicated; manual review required.');
    const materialId = rows[0]?.id || (await addMaterial(owner.id, lessonId, f.name, bytes));
    const saved =
      rows[0] ||
      (await one<{ id: string; storage_key: string; removed_at: number | null }>(
        'SELECT id,storage_key,removed_at FROM lesson_materials WHERE id=?',
        materialId,
      ))!;
    if (
      digest(await getStored(`materials/${saved.storage_key}`, materialPath(saved.storage_key))) !==
      f.sha256
    )
      throw Error('Stored document hash mismatch.');
    attached.push({ id: materialId, name: f.name, sha256: f.sha256 });
  }
  await transaction(async () => {
    await actor(owner.id, ['admin']);
    const quiz = await one('SELECT lesson_id FROM lesson_quizzes WHERE lesson_id=?', lessonId!);
    const expected = l.quiz.questions.map((q, index) => ({
      id: `${lessonId}:${q.id}`,
      position: index,
      kind: q.type,
      prompt: q.question,
      options_json: JSON.stringify(q.options || []),
      answer_json: JSON.stringify(
        q.type === 'single_choice'
          ? { correct_index: q.correct_index, explanation: q.explanation || '' }
          : { sample_answer: q.sample_answer || '', rubric: q.rubric || '' },
      ),
      points: q.points,
    }));
    if (quiz) {
      const actual = await all(
        'SELECT id,position,kind,prompt,options_json,answer_json,points FROM quiz_questions WHERE lesson_id=? ORDER BY position',
        lessonId!,
      );
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw Error('Existing quiz differs; refusing to replace answers or history.');
    } else {
      if (course.status !== 'draft') throw Error('Cannot add a quiz to a published course.');
      await run(
        'INSERT INTO lesson_quizzes VALUES(?,?,?,?,?,?,?)',
        lessonId!,
        'Дәріс бойынша білімді тексеру',
        1,
        l.quiz.suggested_pass_points,
        l.quiz.time_minutes,
        owner.id,
        Date.now(),
      );
      for (const q of expected)
        await run(
          'INSERT INTO quiz_questions VALUES(?,?,?,?,?,?,?,?)',
          q.id,
          lessonId!,
          q.position,
          q.kind,
          q.prompt,
          q.options_json,
          q.answer_json,
          q.points,
        );
      await recordAudit(owner.id, 'quiz.created', lessonId!);
    }
    const practice = await one<Record<string, unknown>>(
      'SELECT title,instructions,starter_code,full_code,requirements,expected_output FROM lesson_practices WHERE lesson_id=?',
      lessonId!,
    );
    if (practice) {
      if (JSON.stringify(practice) !== JSON.stringify(l.practice))
        throw Error('Existing practice differs; refusing overwrite.');
    } else {
      if (course.status !== 'draft') throw Error('Cannot add practice to a published course.');
      const p = l.practice;
      await run(
        'INSERT INTO lesson_practices VALUES(?,?,?,?,?,?,?)',
        lessonId!,
        p.title,
        p.instructions,
        p.starter_code,
        p.full_code,
        p.requirements,
        p.expected_output,
      );
      await recordAudit(owner.id, 'lesson.practice_created', lessonId!);
    }
  });
  receipt.lectures.push({ number: l.number, id: lessonId, materials: attached });
  await writeFile(resolve(root, 'site-import-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(
    `PASS: lecture ${l.number}/${plan.lectures.length}; 4 documents verified; quiz and practice saved.`,
  );
}
if (args.includes('--videos')) {
  const ledger = JSON.parse(
    await readFile(resolve(root, 'video/JELLYPOD_LEDGER.json'), 'utf8'),
  ) as {
    items: Array<{
      lecture: number;
      id: string;
      status: string;
      duration_seconds?: number;
      sha256: string;
    }>;
  };
  for (const video of ledger.items) {
    if (video.status !== 'completed' || !video.duration_seconds || video.duration_seconds > 90)
      continue;
    const lesson = receipt.lectures.find((l) => l.number === video.lecture);
    if (!lesson) throw Error('Video has unknown lecture.');
    const bytes = await readFile(
      localFile(`video/${String(video.lecture).padStart(2, '0')}/video.mp4`),
    );
    if (digest(bytes) !== video.sha256) throw Error('Video changed after verification.');
    await saveLessonVideo(
      owner.id,
      lesson.id,
      bytes,
      Math.round(video.duration_seconds * 1000),
      video.id,
    );
    const stored = await one<{ storage_key: string }>(
      'SELECT storage_key FROM lesson_videos WHERE lesson_id=?',
      lesson.id,
    );
    const { videoPath } = await import('../src/lib/lesson-videos');
    if (
      !stored ||
      digest(await getStored(`videos/${stored.storage_key}`, videoPath(stored.storage_key))) !==
        video.sha256
    )
      throw Error('Stored video hash mismatch.');
    console.log(`PASS: video for lecture ${video.lecture}, ${video.duration_seconds}s.`);
  }
}
if (args.includes('--publish')) {
  await transaction(async () => {
    await actor(owner.id, ['admin']);
    await assertCourseComplete(course.id);
    const count = await one<{ n: number }>(
      'SELECT COUNT(*) n FROM lessons l JOIN sections s ON s.id=l.section_id WHERE s.course_id=?',
      course.id,
    );
    if (count!.n !== plan.lectures.length) throw Error('Course count changed during import.');
    await run(
      "UPDATE courses SET description=?,status='published',updated_at=? WHERE id=? AND owner_id=?",
      plan.description,
      Date.now(),
      course.id,
      owner.id,
    );
    if (course.status !== 'published') {
      await recordAudit(owner.id, 'course.content_imported', course.id);
      await recordAudit(owner.id, 'course.published', course.id);
    }
  });
  receipt.status = 'published';
} else receipt.status = course.status;
await writeFile(resolve(root, 'site-import-receipt.json'), JSON.stringify(receipt, null, 2));
console.log(
  JSON.stringify({
    course_id: course.id,
    status: receipt.status,
    lectures: receipt.lectures.length,
    materials: receipt.lectures.reduce((s, l) => s + l.materials.length, 0),
    owner: owner.name,
  }),
);
