'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser, requireRole } from '@/lib/auth';
import { submitQuiz, gradeShortAnswer } from '@/lib/assessments';
import { ManagementError } from '@/lib/management';
export async function submitQuizAction(form: FormData) {
  const user = await requireUser();
  const lessonId = String(form.get('lessonId') || '');
  const path = `/learn/${encodeURIComponent(lessonId)}`;
  const answers: Record<string, string> = {};
  for (const [key, value] of form.entries())
    if (key.startsWith('answer:') && typeof value === 'string') answers[key.slice(7)] = value;
  try {
    await submitQuiz(user.id, lessonId, String(form.get('submissionKey') || ''), answers);
  } catch (error) {
    if (error instanceof ManagementError)
      redirect(`${path}?quizError=${error.code}#knowledge-check`);
    throw error;
  }
  revalidatePath(path);
  redirect(`${path}?quizSaved=1#knowledge-check`);
}
export async function gradeAnswerAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  let courseId: string;
  try {
    courseId = await gradeShortAnswer(
      user.id,
      String(form.get('attemptId') || ''),
      String(form.get('questionId') || ''),
      Number(form.get('points')),
      String(form.get('feedback') || ''),
    );
  } catch (error) {
    if (error instanceof ManagementError) redirect('/teacher?error=' + error.code);
    throw error;
  }
  revalidatePath(`/teacher/courses/${courseId}/assessment`);
  redirect(`/teacher/courses/${courseId}/assessment?saved=1`);
}
