import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { reviewQueue } from '@/lib/assessments';
import { gradeAnswerAction } from '@/app/assessment-actions';
import { SubmitButton } from '@/components/submit-button';
import { notFound } from 'next/navigation';
import { canReviewCourse } from '@/lib/assessments';
import { ManagementError } from '@/lib/management';
export default async function AssessmentReview({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('teacher', 'admin');
  const { id } = await params;
  try {
    await canReviewCourse(user.id, id);
  } catch (error) {
    if (error instanceof ManagementError && error.message === 'forbidden') notFound();
    throw error;
  }
  const attempts = await reviewQueue(user.id, id);
  return (
    <>
      <Link className="back-link" href={`/teacher/courses/${id}`}>
        ← Курсқа оралу
      </Link>
      <h1>Тест жауаптарын тексеру</h1>
      <p>
        Соңғы 100 әрекет. Студенттің балы барлық қысқа жауап бағаланғаннан кейін қорытындыланады.
      </p>
      {!attempts.length && <div className="panel">Әзірге жіберілген жауап жоқ.</div>}
      {attempts.map((a) => (
        <section className="panel assessment-attempt" key={a.id}>
          <h2>{a.student}</h2>
          <p>
            {a.lesson_title} · {a.points}/{a.max_points} ·{' '}
            {a.status === 'graded' ? 'Бағаланған' : 'Тексеру қажет'}
          </p>
          {a.answers
            .filter((answer) => JSON.parse(answer.question_snapshot).kind === 'short_answer')
            .map((answer) => {
              const q = JSON.parse(answer.question_snapshot) as {
                prompt: string;
                points: number;
                answer_json: string;
              };
              const key = JSON.parse(q.answer_json) as { sample_answer?: string; rubric?: unknown };
              return (
                <article className="quiz-question" key={answer.question_id}>
                  <h3>{q.prompt}</h3>
                  <p className="student-answer">{answer.answer_text}</p>
                  <details>
                    <summary>Бағалау үлгісі</summary>
                    <p>{key.sample_answer}</p>
                    <pre>
                      {typeof key.rubric === 'string'
                        ? key.rubric
                        : JSON.stringify(key.rubric, null, 2)}
                    </pre>
                  </details>
                  <form action={gradeAnswerAction}>
                    <input type="hidden" name="attemptId" value={a.id} />
                    <input type="hidden" name="questionId" value={answer.question_id} />
                    <label>
                      Балл (0–{q.points})
                      <input
                        type="number"
                        name="points"
                        min={0}
                        max={q.points}
                        step={1}
                        required
                        defaultValue={answer.points_awarded ?? ''}
                      />
                    </label>
                    <label>
                      Түсіндірме
                      <textarea
                        name="feedback"
                        maxLength={2000}
                        rows={2}
                        defaultValue={answer.feedback}
                      />
                    </label>
                    <SubmitButton>Бағаны сақтау</SubmitButton>
                  </form>
                </article>
              );
            })}
        </section>
      ))}
    </>
  );
}
