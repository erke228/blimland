'use server';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUser, requireRole, requireUser, SESSION_COOKIE } from '@/lib/auth';
import { one, run, transaction } from '@/lib/db';
import { getCourse } from '@/lib/courses';
import { safeReturnPath, settings } from '@/lib/management';
import { ManagementError } from '@/lib/management';
import {
  courseInput,
  saveCourseInformation,
  saveCoverPreset,
  saveLectureCoverPreset,
  removeCourseSection,
  restoreCourseSection,
  lessonFormInput,
  reopenCourse,
  writeLesson,
  saveSectionInformation,
  assertCourseComplete,
} from '@/lib/course-editor';
import { coverPresets } from '@/lib/cover-presets';
import { hashPassword, verifyPassword, issueSession, rateLimit, tokenHash } from '@/lib/security';
const credentials = z.object({ email: z.email().max(254), password: z.string().min(12).max(128) });
const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
function fail(path: string, error: string): never {
  redirect(`${path}?error=${encodeURIComponent(error)}`);
}
function authFail(path: string, error: string, form: FormData): never {
  const next = safeReturnPath(value(form, 'next'));
  redirect(`${path}?${new URLSearchParams({ error, ...(next ? { next } : {}) })}`);
}
async function signIn(userId: string) {
  (await cookies()).set(SESSION_COOKIE, await issueSession(userId), {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 86400,
  });
}
async function audit(actor: string, action: string, target: string) {
  await run(
    'INSERT INTO audit_log VALUES (?, ?, ?, ?, ?)',
    randomUUID(),
    actor,
    action,
    target,
    Date.now(),
  );
}
export async function register(form: FormData) {
  if (!(await settings()).registration_open) authFail('/register', 'registrationclosed', form);
  const parsed = credentials.extend({ name: z.string().min(2).max(80) }).safeParse({
    name: value(form, 'name'),
    email: value(form, 'email').toLowerCase(),
    password: String(form.get('password') ?? ''),
  });
  if (!parsed.success) authFail('/register', 'registration', form);
  if (!(await rateLimit('register:global', 60, 3600000))) authFail('/register', 'rate', form);
  const { name, email, password } = parsed.data;
  if (await one('SELECT id FROM users WHERE email = ?', email))
    authFail('/register', 'email', form);
  const id = randomUUID();
  const passwordHash = hashPassword(password);
  await transaction(async () => {
    await run(
      'INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      email,
      name,
      passwordHash,
      'student',
      Date.now(),
    );
  });
  await signIn(id);
  redirect(safeReturnPath(value(form, 'next')) || '/dashboard');
}
export async function login(form: FormData) {
  const email = value(form, 'email').toLowerCase();
  const password = String(form.get('password') ?? '');
  if (
    email.length > 254 ||
    password.length > 128 ||
    !(await rateLimit('login:global', 400, 900000)) ||
    !(await rateLimit(`login:${tokenHash(email)}`, 20, 900000))
  )
    authFail('/login', 'rate', form);
  const user = await one<{
    id: string;
    password_hash: string;
    status: string;
    role: string;
  }>('SELECT id, password_hash, status, role FROM users WHERE email = ?', email);
  // Perform comparable work for unknown accounts without exposing account existence.
  const stored = user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`;
  if (!verifyPassword(password, stored) || !user || user.status !== 'active')
    authFail('/login', 'credentials', form);
  await run('UPDATE users SET last_active_at = ? WHERE id = ?', Date.now(), user.id);
  await signIn(user.id);
  redirect(
    safeReturnPath(value(form, 'next')) ||
      (user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/dashboard'),
  );
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await run('DELETE FROM sessions WHERE token_hash = ?', tokenHash(token));
  jar.delete(SESSION_COOKIE);
  redirect('/');
}
export async function applyTeacher(form: FormData) {
  const user = await requireUser();
  if (user.role !== 'student') redirect('/teacher');
  const bio = value(form, 'bio');
  if (bio.length < 20 || bio.length > 3000) fail('/profile', 'bio');
  const application = await one<{
    status: string;
  }>('SELECT status FROM teacher_applications WHERE user_id = ?', user.id);
  if (application?.status === 'pending' || application?.status === 'approved') redirect('/profile');
  await run(
    `INSERT INTO teacher_applications (id, user_id, bio, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET bio = excluded.bio, status = 'pending', review_note = '', reviewed_by = NULL, reviewed_at = NULL, created_at = excluded.created_at`,
    randomUUID(),
    user.id,
    bio,
    Date.now(),
  );
  revalidatePath('/profile');
  redirect('/profile?success=application');
}
export async function reviewTeacher(form: FormData) {
  const admin = await requireRole('admin');
  const id = value(form, 'id');
  const decision = value(form, 'decision');
  if (!['approved', 'rejected'].includes(decision)) fail('/admin/review', 'invalid');
  await transaction(async () => {
    const application = await one<{
      user_id: string;
      status: string;
    }>('SELECT user_id, status FROM teacher_applications WHERE id = ?', id);
    if (!application || application.status !== 'pending') return;
    await run(
      'UPDATE teacher_applications SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?',
      decision,
      value(form, 'note').slice(0, 1000),
      admin.id,
      Date.now(),
      id,
    );
    if (decision === 'approved')
      await run(
        "UPDATE users SET role = 'teacher' WHERE id = ? AND role = 'student'",
        application.user_id,
      );
    await audit(admin.id, `teacher.${decision}`, application.user_id);
  });
  revalidatePath('/admin/review');
  redirect('/admin/review');
}
export async function enroll(form: FormData) {
  const user = await requireUser();
  const course = await getCourse(value(form, 'courseId'));
  if (!course || course.status !== 'published') fail('/courses', 'course');
  await run('INSERT OR IGNORE INTO enrollments VALUES (?, ?, ?)', user.id, course.id, Date.now());
  revalidatePath('/dashboard');
  redirect(`/courses/${course.id}`);
}
export async function createCourse(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const parsed = courseInput.safeParse(courseFormData(form));
  if (!parsed.success) fail('/teacher/new', 'courseform');
  if (value(form, 'coverPreset') && !coverPresets.some((p) => p.id === value(form, 'coverPreset')))
    fail('/teacher/new', 'coverinvalid');
  const course = parsed.data;
  const id = randomUUID();
  await transaction(async () => {
    await run(
      'INSERT INTO courses (id,owner_id,title,description,category,level,status,accent,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      user.id,
      course.title,
      course.description,
      course.category,
      course.level,
      'draft',
      'teal',
      Date.now(),
      Date.now(),
    );
    await run('INSERT INTO sections VALUES (?, ?, ?, ?)', randomUUID(), id, 'Негізгі бөлім', 0);
    await saveCoverPreset(user.id, id, value(form, 'coverPreset') || 'books');
  });
  redirect(`/teacher/courses/${id}`);
}
function courseFormData(form: FormData) {
  return {
    title: value(form, 'title'),
    description: value(form, 'description'),
    category: value(form, 'category'),
    level: value(form, 'level') || 'Бастапқы',
  };
}
async function editorAction(
  form: FormData,
  work: (actorId: string, courseId: string) => void | Promise<unknown>,
  anchor = '',
) {
  const user = await requireRole('teacher', 'admin');
  const id = value(form, 'courseId');
  try {
    await work(user.id, id);
  } catch (error) {
    if (error instanceof ManagementError) fail(`/teacher/courses/${id}`, error.code);
    throw error;
  }
  revalidatePath('/');
  revalidatePath('/courses');
  revalidatePath(`/teacher/courses/${id}`);
  revalidatePath(`/courses/${id}`);
  const tab =
    anchor.includes('lecture-cover') || anchor === '#cover'
      ? 'cover'
      : anchor === '#settings'
        ? 'settings'
        : anchor.includes('materials')
          ? 'materials'
          : 'structure';
  redirect(`/teacher/courses/${id}?success=saved&tab=${tab}${anchor}`);
}
export async function saveCourseDetails(form: FormData) {
  return await editorAction(
    form,
    async (actorId, id) => await saveCourseInformation(actorId, id, courseFormData(form)),
    '#settings',
  );
}
export async function selectCourseCover(form: FormData) {
  return await editorAction(
    form,
    async (actorId, id) => await saveCoverPreset(actorId, id, value(form, 'coverPreset')),
    '#cover',
  );
}
export async function selectLectureCover(form: FormData) {
  const lessonId = value(form, 'lessonId');
  return await editorAction(
    form,
    async (actorId, id) =>
      await saveLectureCoverPreset(actorId, id, lessonId, value(form, 'coverPreset')),
    `&lesson=${encodeURIComponent(lessonId)}#lecture-cover`,
  );
}
export async function reopenCourseForEditing(form: FormData) {
  const lessonId = value(form, 'lessonId');
  return await editorAction(
    form,
    reopenCourse,
    lessonId ? `&lesson=${encodeURIComponent(lessonId)}#materials` : '',
  );
}
export async function removeSection(form: FormData) {
  return await editorAction(
    form,
    async (actorId, id) =>
      await removeCourseSection(
        actorId,
        id,
        value(form, 'sectionId'),
        value(form, 'targetId'),
        true,
      ),
    '#structure',
  );
}
export async function restoreSection(form: FormData) {
  return await editorAction(
    form,
    async (actorId, id) => await restoreCourseSection(actorId, id, value(form, 'sectionId')),
    '#structure',
  );
}
export async function updateSection(form: FormData) {
  return await editorAction(
    form,
    async (actorId, id) =>
      await saveSectionInformation(
        actorId,
        id,
        value(form, 'sectionId'),
        value(form, 'title'),
        Number(value(form, 'position')),
      ),
    '#structure',
  );
}
async function editableCourse(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const course = await getCourse(value(form, 'courseId'));
  if (!course || (course.owner_id !== user.id && user.role !== 'admin'))
    fail('/teacher', 'forbidden');
  if (course.status !== 'draft') fail(`/teacher/courses/${course.id}`, 'readonly');
  return { user, course };
}
export async function addSection(form: FormData) {
  const { user, course } = await editableCourse(form);
  const title = value(form, 'title');
  if (title.length < 2 || title.length > 140) fail(`/teacher/courses/${course.id}`, 'invalid');
  const sectionId = randomUUID();
  await transaction(async () => {
    await run(
      'INSERT INTO sections VALUES (?, ?, ?, ?)',
      sectionId,
      course.id,
      title,
      (await one<{
        n: number;
      }>(
        'SELECT COUNT(*) n FROM sections s WHERE course_id = ? AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id)',
        course.id,
      ))!.n,
    );
    await audit(user.id, 'section.created', sectionId);
  });
  revalidatePath(`/teacher/courses/${course.id}`);
  redirect(`/teacher/courses/${course.id}?success=saved`);
}
export async function saveLesson(form: FormData) {
  const { user, course } = await editableCourse(form);
  let lessonId = '';
  try {
    lessonId = await writeLesson(user.id, course.id, lessonFormInput(form));
  } catch (error) {
    if (error instanceof ManagementError) fail(`/teacher/courses/${course.id}`, error.code);
    throw error;
  }
  revalidatePath(`/teacher/courses/${course.id}`);
  redirect(`/teacher/courses/${course.id}?lesson=${lessonId}&success=saved#lesson-editor`);
}
export async function submitCourse(form: FormData) {
  const { user, course } = await editableCourse(form);
  try {
    await assertCourseComplete(course.id);
  } catch (error) {
    if (error instanceof ManagementError) fail(`/teacher/courses/${course.id}`, error.code);
    throw error;
  }
  await run(
    "UPDATE courses SET status = 'submitted', updated_at = ? WHERE id = ?",
    Date.now(),
    course.id,
  );
  await audit(user.id, 'course.submitted', course.id);
  redirect(`/teacher/courses/${course.id}`);
}
export async function reviewCourse(form: FormData) {
  const user = await requireRole('admin');
  const courseId = value(form, 'courseId');
  if (!['published', 'draft'].includes(value(form, 'decision'))) fail('/admin/review', 'invalid');
  const status = value(form, 'decision') === 'published' ? 'published' : 'draft';
  await transaction(async () => {
    const changed = await run(
      "UPDATE courses SET status = ?, updated_at = ? WHERE id = ? AND status = 'submitted'",
      status,
      Date.now(),
      courseId,
    );
    if (changed.changes) await audit(user.id, `course.${status}`, courseId);
  });
  revalidatePath('/courses');
  redirect('/admin/review');
}
export async function completeLesson(form: FormData) {
  const user = await requireUser();
  const lessonId = value(form, 'lessonId');
  const lesson = await one<{
    course_id: string;
  }>(
    `SELECT s.course_id FROM lessons l JOIN sections s ON s.id = l.section_id
    JOIN courses c ON c.id = s.course_id JOIN enrollments e ON e.course_id = c.id AND e.user_id = ?
    WHERE l.id = ? AND c.status = 'published' AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id)`,
    user.id,
    lessonId,
  );
  if (!lesson) fail('/dashboard', 'forbidden');
  await run(
    'INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET completed_at = excluded.completed_at',
    user.id,
    lessonId,
    Date.now(),
  );
  revalidatePath('/dashboard');
  revalidatePath(`/courses/${lesson.course_id}`);
  await run('UPDATE users SET last_active_at = ? WHERE id = ?', Date.now(), user.id);
  redirect(`/learn/${lessonId}?success=completed`);
}
