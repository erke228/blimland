import { randomUUID } from 'node:crypto';
import { all, one, run, transaction } from './db';
import { actor, ManagementError, recordAudit } from './management';
import { canReadLesson, lessonAccess } from './materials';

export type PublicQuestion = {
  id: string;
  position: number;
  kind: 'single_choice' | 'short_answer';
  prompt: string;
  options: string[];
  points: number;
};
type QuestionRow = Omit<PublicQuestion, 'options'> & { options_json: string; answer_json: string };
export type Attempt = {
  id: string;
  user_id: string;
  lesson_id: string;
  submitted_at: number;
  status: 'awaiting_review' | 'graded';
  points: number;
  max_points: number;
  pass_points: number;
};
export async function publicQuiz(lessonId: string, userId?: string) {
  if (!(await canReadLesson(lessonId, userId))) throw new ManagementError('forbidden');
  const quiz = await one<{
    title: string;
    version: number;
    pass_points: number;
    suggested_minutes: number;
  }>(
    'SELECT title,version,pass_points,suggested_minutes FROM lesson_quizzes WHERE lesson_id=?',
    lessonId,
  );
  if (!quiz) return undefined;
  // Never SELECT answer_json for the student view or serialize a whole DB row.
  const rows = await all<Omit<QuestionRow, 'answer_json'>>(
    'SELECT id,position,kind,prompt,options_json,points FROM quiz_questions WHERE lesson_id=? ORDER BY position',
    lessonId,
  );
  return {
    ...quiz,
    questions: rows.map(({ options_json, ...q }) => ({
      ...q,
      options: JSON.parse(options_json) as string[],
    })),
  };
}
export async function latestAttempt(userId: string, lessonId: string) {
  await actor(userId);
  return one<Attempt>(
    'SELECT id,user_id,lesson_id,submitted_at,status,points,max_points,pass_points FROM quiz_attempts WHERE user_id=? AND lesson_id=? ORDER BY submitted_at DESC,id DESC LIMIT 1',
    userId,
    lessonId,
  );
}
export async function ownAttemptFeedback(userId: string, attemptId: string) {
  await actor(userId);
  if (!(await one('SELECT id FROM quiz_attempts WHERE id=? AND user_id=?', attemptId, userId)))
    throw new ManagementError('forbidden');
  const rows = await all<{
    question_snapshot: string;
    points_awarded: number | null;
    feedback: string;
  }>(
    'SELECT question_snapshot,points_awarded,feedback FROM quiz_answers WHERE attempt_id=?',
    attemptId,
  );
  return rows
    .filter((r) => !!r.feedback)
    .map((r) => ({
      prompt: (JSON.parse(r.question_snapshot) as { prompt: string }).prompt,
      points: r.points_awarded,
      feedback: r.feedback,
    }));
}
export async function submitQuiz(
  userId: string,
  lessonId: string,
  submissionKey: string,
  answers: Record<string, string>,
) {
  await actor(userId);
  if (!/^[a-f0-9-]{36}$/.test(submissionKey)) throw new ManagementError('invalid');
  return transaction(async () => {
    if (!(await canReadLesson(lessonId, userId))) throw new ManagementError('forbidden');
    const lesson = await lessonAccess(lessonId);
    if (
      !lesson ||
      lesson.status !== 'published' ||
      !(await one(
        'SELECT user_id FROM enrollments WHERE course_id=? AND user_id=?',
        lesson.course_id,
        userId,
      ))
    )
      throw new ManagementError('notenrolled');
    const duplicate = await one<{ id: string }>(
      'SELECT id FROM quiz_attempts WHERE user_id=? AND lesson_id=? AND submission_key=?',
      userId,
      lessonId,
      submissionKey,
    );
    if (duplicate) return duplicate.id;
    const recent = await one<{ n: number }>(
      'SELECT COUNT(*) n FROM quiz_attempts WHERE user_id=? AND lesson_id=? AND submitted_at>?',
      userId,
      lessonId,
      Date.now() - 86400000,
    );
    if (recent!.n >= 3) throw new ManagementError('attemptlimit');
    const quiz = await one<{ version: number; pass_points: number }>(
      'SELECT version,pass_points FROM lesson_quizzes WHERE lesson_id=?',
      lessonId,
    );
    if (!quiz) throw new ManagementError('invalid');
    const questions = await all<QuestionRow>(
      'SELECT id,position,kind,prompt,options_json,answer_json,points FROM quiz_questions WHERE lesson_id=? ORDER BY position',
      lessonId,
    );
    if (
      !questions.length ||
      Object.keys(answers).length !== questions.length ||
      Object.keys(answers).some((id) => !questions.some((q) => q.id === id))
    )
      throw new ManagementError('quizanswers');
    const graded = questions.map((q) => {
      const answer = answers[q.id];
      if (typeof answer !== 'string' || !answer.trim() || answer.length > 3000)
        throw new ManagementError('quizanswers');
      let points: number | null = null;
      if (q.kind === 'single_choice') {
        const options = JSON.parse(q.options_json) as string[];
        if (
          !/^[0-9]+$/.test(answer) ||
          !Number.isInteger(Number(answer)) ||
          Number(answer) >= options.length
        )
          throw new ManagementError('quizanswers');
        const key = JSON.parse(q.answer_json) as { correct_index: number };
        points = Number(answer) === key.correct_index ? q.points : 0;
      }
      return { q, answer, points };
    });
    const id = randomUUID();
    await run(
      'INSERT INTO quiz_attempts(id,lesson_id,user_id,quiz_version,submission_key,submitted_at,status,points,max_points,pass_points) VALUES(?,?,?,?,?,?,?,?,?,?)',
      id,
      lessonId,
      userId,
      quiz.version,
      submissionKey,
      Date.now(),
      graded.some((a) => a.points === null) ? 'awaiting_review' : 'graded',
      graded.reduce((s, a) => s + (a.points || 0), 0),
      questions.reduce((s, q) => s + q.points, 0),
      quiz.pass_points,
    );
    for (const a of graded)
      await run(
        'INSERT INTO quiz_answers(attempt_id,question_id,question_snapshot,answer_text,points_awarded) VALUES(?,?,?,?,?)',
        id,
        a.q.id,
        JSON.stringify(a.q),
        a.answer,
        a.points,
      );
    await recordAudit(userId, 'quiz.submitted', id);
    return id;
  });
}
export async function canReviewCourse(userId: string, courseId: string) {
  const user = await actor(userId, ['teacher', 'admin']);
  const course = await one<{ owner_id: string }>(
    'SELECT owner_id FROM courses WHERE id=?',
    courseId,
  );
  if (!course || (user.role !== 'admin' && course.owner_id !== user.id))
    throw new ManagementError('forbidden');
}
export async function reviewQueue(userId: string, courseId: string) {
  await canReviewCourse(userId, courseId);
  const rows = await all<Attempt & { student: string; lesson_title: string }>(
    `SELECT a.id,a.user_id,a.lesson_id,a.submitted_at,a.status,a.points,a.max_points,a.pass_points,u.name student,l.title lesson_title FROM quiz_attempts a JOIN users u ON u.id=a.user_id JOIN lessons l ON l.id=a.lesson_id JOIN sections s ON s.id=l.section_id WHERE s.course_id=? ORDER BY a.submitted_at DESC LIMIT 100`,
    courseId,
  );
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      answers: await all<{
        question_id: string;
        question_snapshot: string;
        answer_text: string;
        points_awarded: number | null;
        feedback: string;
      }>(
        'SELECT question_id,question_snapshot,answer_text,points_awarded,feedback FROM quiz_answers WHERE attempt_id=? ORDER BY question_id',
        row.id,
      ),
    })),
  );
}
export async function gradeShortAnswer(
  userId: string,
  attemptId: string,
  questionId: string,
  points: number,
  feedback: string,
) {
  return transaction(async () => {
    const attempt = await one<{ course_id: string }>(
      'SELECT s.course_id FROM quiz_attempts a JOIN lessons l ON l.id=a.lesson_id JOIN sections s ON s.id=l.section_id WHERE a.id=?',
      attemptId,
    );
    if (!attempt) throw new ManagementError('forbidden');
    await canReviewCourse(userId, attempt.course_id);
    const answer = await one<{ question_snapshot: string }>(
      'SELECT question_snapshot FROM quiz_answers WHERE attempt_id=? AND question_id=?',
      attemptId,
      questionId,
    );
    if (!answer) throw new ManagementError('invalid');
    const q = JSON.parse(answer.question_snapshot) as QuestionRow;
    if (
      q.kind !== 'short_answer' ||
      !Number.isInteger(points) ||
      points < 0 ||
      points > q.points ||
      feedback.length > 2000
    )
      throw new ManagementError('invalid');
    await run(
      'UPDATE quiz_answers SET points_awarded=?,feedback=?,reviewed_by=?,reviewed_at=? WHERE attempt_id=? AND question_id=?',
      points,
      feedback,
      userId,
      Date.now(),
      attemptId,
      questionId,
    );
    const totals = await one<{ points: number; pending: number }>(
      'SELECT COALESCE(SUM(points_awarded),0) points,SUM(CASE WHEN points_awarded IS NULL THEN 1 ELSE 0 END) pending FROM quiz_answers WHERE attempt_id=?',
      attemptId,
    );
    await run(
      'UPDATE quiz_attempts SET points=?,status=? WHERE id=?',
      totals!.points,
      totals!.pending ? 'awaiting_review' : 'graded',
      attemptId,
    );
    await recordAudit(userId, 'quiz.answer_graded', attemptId);
    return attempt.course_id;
  });
}
