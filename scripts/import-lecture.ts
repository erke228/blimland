import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { migrate, one, run, transaction } from '../src/lib/db';
import { addMaterial, materialPath } from '../src/lib/materials';
import { recordAudit } from '../src/lib/management';

// Explicit local import requested by the owner. No account, email, password or
// role is created/changed; the existing sole administrator owns the lecture.
const source = process.argv[2];
if (!source) throw new Error('Usage: npm run lecture:import -- path/to/Byte-pair-encoding.pdf');
migrate();
const owner = one<{ id: string }>(
  "SELECT id FROM users WHERE role = 'admin' AND status = 'active'",
);
if (!owner) throw new Error('Сначала создайте единственного администратора через admin:create.');
const courseId = 'natural-language-processing';
const sectionId = 'nlp-lectures';
const lessonId = 'byte-pair-encoding';
const bytes = await readFile(source);
transaction(() => {
  run(
    'UPDATE users SET name = ?, updated_at = ? WHERE id = ?',
    'Тлеужанова Қ. Е.',
    Date.now(),
    owner.id,
  );
  recordAudit(owner.id, 'profile.owner_name_updated', owner.id);
  if (!one('SELECT id FROM courses WHERE id = ?', courseId)) {
    run(
      'INSERT INTO courses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      courseId,
      owner.id,
      'Табиғи тілді өңдеу',
      'Тлеужанова Қ. Е. дәрістері: мәтінді токенизациялау, Byte Pair Encoding, лексикалық талдау, WordNet және контекстегі сөз мағынасын анықтау.',
      'Технология',
      'Орташа',
      0,
      'draft',
      'teal',
      Date.now(),
      Date.now(),
    );
    run('INSERT INTO sections VALUES (?, ?, ?, ?)', sectionId, courseId, 'Дәрістер', 0);
    run(
      'INSERT INTO lessons VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      lessonId,
      sectionId,
      '1-дәріс. Byte Pair Encoding және лексикалық талдау',
      'Оқытушы: Тлеужанова Қ. Е.\n\nБұл дәрісте мәтінді ішкі сөздерге бөлу, BPE сөздігін құру және лексикалық талдау қарастырылады. Түпнұсқа PDF төменде толық берілген: 16 бет, қазақ тіліндегі түсіндірмелер, сызбалар және Python мысалдары.\n\n1–5-беттер: Byte Pair Encoding, сөздік пен ішкі сөздер, tokenizers кітапханасы және арнайы токендер.\n\n5–13-беттер: лексикалық талдау, WordNet / ruWordNet, мағыналар, синсеттер және олардың байланыстары.\n\n13–16-беттер: сөздің контекстегі мағынасын ажырату және Lesk алгоритмінің мысалдары.\n\nPDF беттерін төмендегі көрсеткілермен немесе бет нөмірі арқылы ауыстырыңыз. Қажет болса, масштабын өзгертіңіз немесе түпнұсқаны жүктеп алыңыз.',
      '',
      45,
      0,
      1,
    );
  }
});
const existing = one<{ id: string; storage_key: string }>(
  'SELECT id, storage_key FROM lesson_materials WHERE lesson_id = ? AND original_name = ? AND removed_at IS NULL',
  lessonId,
  'Byte-pair-encoding.pdf',
);
let materialId = existing?.id;
if (existing) {
  const saved = await readFile(materialPath(existing.storage_key));
  if (!saved.equals(bytes))
    throw new Error(
      'Лекция уже существует с другим содержимым: автоматическая перезапись запрещена.',
    );
} else materialId = await addMaterial(owner.id, lessonId, 'Byte-pair-encoding.pdf', bytes);
transaction(() => {
  run(
    "UPDATE courses SET status = 'published', updated_at = ? WHERE id = ? AND owner_id = ?",
    Date.now(),
    courseId,
    owner.id,
  );
  recordAudit(owner.id, 'lecture.owner_imported', lessonId);
});
console.log(
  JSON.stringify(
    {
      course: `/courses/${courseId}`,
      lesson: `/learn/${lessonId}`,
      materialId,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    null,
    2,
  ),
);
