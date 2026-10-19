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
import {
  hashPassword,
  verifyPassword,
  issueSession,
  rateLimit,
  safeVideoUrl,
  tokenHash,
} from '@/lib/security';

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
  (await cookies()).set(SESSION_COOKIE, issueSession(userId), {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 86400,
  });
}
function audit(actor: string, action: string, target: string) {
  run(
    'INSERT INTO audit_log VALUES (?, ?, ?, ?, ?)',
    randomUUID(),
    actor,
    action,
    target,
    Date.now(),
  );
}

export async function register(form: FormData) {
  if (!settings().registration_open) authFail('/register', 'registrationclosed', form);
  const parsed = credentials.extend({ name: z.string().min(2).max(80) }).safeParse({
    name: value(form, 'name'),
    email: value(form, 'email').toLowerCase(),
    password: String(form.get('password') ?? ''),
  });
  if (!parsed.success) authFail('/register', 'registration', form);
  if (!rateLimit('register:global', 60, 3600000)) authFail('/register', 'rate', form);
  const { name, email, password } = parsed.data;
  if (one('SELECT id FROM users WHERE email = ?', email)) authFail('/register', 'email', form);
  const id = randomUUID();
  const passwordHash = hashPassword(password);
  transaction(() => {
    run(
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
    !rateLimit('login:global', 400, 900000) ||
    !rateLimit(`login:${tokenHash(email)}`, 20, 900000)
  )
    authFail('/login', 'rate', form);
  const user = one<{ id: string; password_hash: string; status: string; role: string }>(
    'SELECT id, password_hash, status, role FROM users WHERE email = ?',
    email,
  );
  // Perform comparable work for unknown accounts without exposing account existence.
  const stored = user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`;
  if (!verifyPassword(password, stored) || !user || user.status !== 'active')
    authFail('/login', 'credentials', form);
  run('UPDATE users SET last_active_at = ? WHERE id = ?', Date.now(), user.id);
  await signIn(user.id);
  redirect(
    safeReturnPath(value(form, 'next')) ||
      (user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/dashboard'),
  );
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', tokenHash(token));
  jar.delete(SESSION_COOKIE);
  redirect('/');
}

export async function applyTeacher(form: FormData) {
  const user = await requireUser();
  if (user.role !== 'student') redirect('/teacher');
  const bio = value(form, 'bio');
  if (bio.length < 20 || bio.length > 3000) fail('/profile', 'bio');
  const application = one<{ status: string }>(
    'SELECT status FROM teacher_applications WHERE user_id = ?',
    user.id,
  );
  if (application?.status === 'pending' || application?.status === 'approved') redirect('/profile');
  run(
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
  if (!['approved', 'rejected'].includes(decision)) fail('/admin', 'invalid');
  transaction(() => {
    const application = one<{ user_id: string; status: string }>(
      'SELECT user_id, status FROM teacher_applications WHERE id = ?',
      id,
    );
    if (!application || application.status !== 'pending') return;
    run(
      'UPDATE teacher_applications SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?',
      decision,
      value(form, 'note').slice(0, 1000),
      admin.id,
      Date.now(),
      id,
    );
    if (decision === 'approved')
      run(
        "UPDATE users SET role = 'teacher' WHERE id = ? AND role = 'student'",
        application.user_id,
      );
    audit(admin.id, `teacher.${decision}`, application.user_id);
  });
  revalidatePath('/admin');
  redirect('/admin');
}

export async function enroll(form: FormData) {
  const user = await requireUser();
  const course = getCourse(value(form, 'courseId'));
  if (!course || course.status !== 'published') fail('/courses', 'course');
  if (course.price_kzt !== 0) fail(`/courses/${course.id}`, 'payment');
  run('INSERT OR IGNORE INTO enrollments VALUES (?, ?, ?)', user.id, course.id, Date.now());
  revalidatePath('/dashboard');
  redirect(`/courses/${course.id}`);
}

export async function createCourse(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const parsed = z
    .object({
      title: z.string().min(5).max(140),
      description: z.string().min(30).max(5000),
      category: z.enum(['Математика', 'Тілдер', 'Технология', 'Жаратылыстану', 'Басқа']),
      price: z.coerce.number().int().min(0).max(10000000),
    })
    .safeParse({
      title: value(form, 'title'),
      description: value(form, 'description'),
      category: value(form, 'category'),
      price: value(form, 'price') || '0',
    });
  if (!parsed.success) fail('/teacher/new', 'courseform');
  const course = parsed.data;
  const id = randomUUID();
  transaction(() => {
    run(
      'INSERT INTO courses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      user.id,
      course.title,
      course.description,
      course.category,
      'Бастапқы',
      course.price,
      'draft',
      'teal',
      Date.now(),
      Date.now(),
    );
    run('INSERT INTO sections VALUES (?, ?, ?, ?)', randomUUID(), id, 'Негізгі бөлім', 0);
  });
  redirect(`/teacher/courses/${id}`);
}

async function editableCourse(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const course = getCourse(value(form, 'courseId'));
  if (!course || (course.owner_id !== user.id && user.role !== 'admin'))
    fail('/teacher', 'forbidden');
  if (course.status !== 'draft') fail(`/teacher/courses/${course.id}`, 'readonly');
  return { user, course };
}

export async function addSection(form: FormData) {
  const { course } = await editableCourse(form);
  const title = value(form, 'title');
  if (title.length < 2 || title.length > 140) fail(`/teacher/courses/${course.id}`, 'invalid');
  run(
    'INSERT INTO sections VALUES (?, ?, ?, ?)',
    randomUUID(),
    course.id,
    title,
    one<{ n: number }>('SELECT COUNT(*) n FROM sections WHERE course_id = ?', course.id)!.n,
  );
  revalidatePath(`/teacher/courses/${course.id}`);
  redirect(`/teacher/courses/${course.id}?success=saved`);
}

export async function saveLesson(form: FormData) {
  const { course } = await editableCourse(form);
  const sectionId = value(form, 'sectionId');
  if (!one('SELECT id FROM sections WHERE id = ? AND course_id = ?', sectionId, course.id))
    fail('/teacher', 'forbidden');
  const title = value(form, 'title');
  const body = value(form, 'body');
  const video = safeVideoUrl(value(form, 'videoUrl'));
  const minutes = Number(value(form, 'minutes'));
  if (
    title.length < 3 ||
    title.length > 180 ||
    body.length > 30000 ||
    (!body && !video) ||
    video === null ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 600
  )
    fail(`/teacher/courses/${course.id}`, 'lessonform');
  const lessonId = value(form, 'lessonId');
  if (lessonId) {
    if (!one('SELECT id FROM lessons WHERE id = ? AND section_id = ?', lessonId, sectionId))
      fail('/teacher', 'forbidden');
    run(
      'UPDATE lessons SET title = ?, body = ?, video_url = ?, duration_minutes = ?, is_preview = ? WHERE id = ?',
      title,
      body,
      video,
      minutes,
      form.get('preview') === 'on' ? 1 : 0,
      lessonId,
    );
  } else {
    run(
      'INSERT INTO lessons VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      randomUUID(),
      sectionId,
      title,
      body,
      video,
      minutes,
      one<{ n: number }>('SELECT COUNT(*) n FROM lessons WHERE section_id = ?', sectionId)!.n,
      form.get('preview') === 'on' ? 1 : 0,
    );
  }
  run('UPDATE courses SET updated_at = ? WHERE id = ?', Date.now(), course.id);
  revalidatePath(`/teacher/courses/${course.id}`);
  redirect(`/teacher/courses/${course.id}?success=saved`);
}

export async function submitCourse(form: FormData) {
  const { user, course } = await editableCourse(form);
  if (!course.lesson_count) fail(`/teacher/courses/${course.id}`, 'emptycourse');
  run(
    "UPDATE courses SET status = 'submitted', updated_at = ? WHERE id = ?",
    Date.now(),
    course.id,
  );
  audit(user.id, 'course.submitted', course.id);
  redirect(`/teacher/courses/${course.id}`);
}

export async function reviewCourse(form: FormData) {
  const user = await requireRole('admin');
  const courseId = value(form, 'courseId');
  if (!['published', 'draft'].includes(value(form, 'decision'))) fail('/admin', 'invalid');
  const status = value(form, 'decision') === 'published' ? 'published' : 'draft';
  transaction(() => {
    const changed = run(
      "UPDATE courses SET status = ?, updated_at = ? WHERE id = ? AND status = 'submitted'",
      status,
      Date.now(),
      courseId,
    );
    if (changed.changes) audit(user.id, `course.${status}`, courseId);
  });
  revalidatePath('/courses');
  redirect('/admin');
}

export async function completeLesson(form: FormData) {
  const user = await requireUser();
  const lessonId = value(form, 'lessonId');
  const lesson = one<{ course_id: string }>(
    `SELECT s.course_id FROM lessons l JOIN sections s ON s.id = l.section_id
    JOIN courses c ON c.id = s.course_id JOIN enrollments e ON e.course_id = c.id AND e.user_id = ?
    WHERE l.id = ? AND c.status = 'published'`,
    user.id,
    lessonId,
  );
  if (!lesson) fail('/dashboard', 'forbidden');
  run(
    'INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET completed_at = excluded.completed_at',
    user.id,
    lessonId,
    Date.now(),
  );
  revalidatePath('/dashboard');
  revalidatePath(`/courses/${lesson.course_id}`);
  run('UPDATE users SET last_active_at = ? WHERE id = ?', Date.now(), user.id);
  redirect(`/learn/${lessonId}?success=completed`);
}
