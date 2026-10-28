import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

test('Removing course pricing preserves existing courses, documents, enrollment, progress and group assignments', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const migration of [
      '001_core',
      '002_university_management',
      '003_lesson_materials',
      '004_course_editor',
      '005_lecture_covers',
      '006_section_trash',
      '007_course_lifecycle_profiles',
    ])
      db.exec(readFileSync(`db/migrations/${migration}.sql`, 'utf8'));
    db.exec(`
      INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES ('teacher','teacher@test.invalid','Оқытушы','test','teacher',1),('student','student@test.invalid','Студент','test','student',1);
      INSERT INTO courses VALUES ('course','teacher','Курс','Сипаттама','Пән','Бастапқы',5000,'published','teal',1,1);
      INSERT INTO sections VALUES ('section','course','Бөлім',0);
      INSERT INTO lessons VALUES ('lesson','section','Дәріс','Мәтін','',10,0,0);
      INSERT INTO enrollments VALUES ('student','course',1);
      INSERT INTO lesson_progress(user_id,lesson_id,completed_at) VALUES ('student','lesson',1);
      INSERT INTO lesson_materials(id,lesson_id,original_name,storage_key,kind,size_bytes,created_by,created_at) VALUES ('material','lesson','lecture.pdf','fixture.pdf','pdf',123,'teacher',1);
      INSERT INTO academic_groups VALUES ('group','teacher','Топ','','2026–2027',1,'','active',1);
      INSERT INTO group_courses VALUES ('group','course',1);
    `);
    const tables = [
      'users',
      'courses',
      'sections',
      'lessons',
      'enrollments',
      'lesson_progress',
      'lesson_materials',
      'academic_groups',
      'group_courses',
    ];
    const before = tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all());
    db.exec(readFileSync('db/migrations/008_remove_course_pricing.sql', 'utf8'));
    const after = tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all());
    before[1].forEach((course) => delete course.price_kzt);
    assert.deepEqual(after, before);
    assert(
      !db
        .prepare('PRAGMA table_info(courses)')
        .all()
        .some((column) => column.name === 'price_kzt'),
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});
