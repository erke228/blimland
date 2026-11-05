import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { latestAttempt, publicQuiz, ownAttemptFeedback } from '@/lib/assessments';
import { submitQuizAction } from '@/app/assessment-actions';
import { SubmitButton } from './submit-button';
const errors: Record<string, string> = {
  quizanswers: 'Әр сұраққа жауап беріңіз.',
  attemptlimit: 'Тәулігіне 3 әрекетке дейін рұқсат етіледі. Келесі күні қайталаңыз.',
  notenrolled: 'Тест тапсыру үшін курсқа жазылыңыз.',
  forbidden: 'Бұл тестке қолжетімділік жоқ.',
  invalid: 'Жауаптарды қайта тексеріп жіберіңіз.',
};
export async function LessonQuiz({
  lessonId,
  userId,
  enrolled,
  error,
  saved,
  preview = false,
}: {
  lessonId: string;
  userId?: string;
  enrolled: boolean;
  error?: string;
  saved?: string;
  preview?: boolean;
}) {
  const quiz = await publicQuiz(lessonId, userId);
  if (!quiz) return null;
  const attempt = userId && !preview ? await latestAttempt(userId, lessonId) : undefined;
  const feedback = attempt && userId ? await ownAttemptFeedback(userId, attempt.id) : [];
  const max = quiz.questions.reduce((s, q) => s + q.points, 0);
  return (
    <section className="panel knowledge-check" id="knowledge-check">
      <span className="eyebrow">БІЛІМДІ ТЕКСЕРУ</span>
      <h2>{quiz.title}</h2>
      <p>
        {quiz.questions.length} тапсырма · {max} балл · өту шегі {quiz.pass_points} · шамамен{' '}
        {quiz.suggested_minutes} минут
      </p>
      <p className="help-text">
        Таңдау сұрақтары автоматты тексеріледі. Қысқа жауаптарды оқытушы бағалайды. Тәулігіне 3
        әрекет.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {errors[error] || errors.invalid}
        </p>
      )}
      {saved && (
        <p className="notice success" role="status">
          Жауаптар сақталды.
        </p>
      )}
      {attempt && (
        <div className="quiz-result" role="status">
          <strong>
            Соңғы нәтиже: {attempt.points} / {attempt.max_points}
          </strong>
          <p>
            {attempt.status === 'awaiting_review'
              ? 'Қысқа жауаптар оқытушының тексеруін күтуде. Балл әлі толық емес.'
              : attempt.points >= attempt.pass_points
                ? 'Тексеру аяқталды. Өту шегіне жеттіңіз.'
                : 'Тексеру аяқталды. Дәрісті қайталап, қайта тапсыруға болады.'}
          </p>
        </div>
      )}
      {!!feedback.length && (
        <details>
          <summary>Оқытушының пікірлері</summary>
          {feedback.map((item, i) => (
            <p key={i}>
              <strong>{item.prompt}</strong>
              <br />
              {item.feedback} ({item.points} балл)
            </p>
          ))}
        </details>
      )}
      <form action={submitQuizAction}>
        <input type="hidden" name="lessonId" value={lessonId} />
        <input type="hidden" name="submissionKey" value={randomUUID()} />
        {quiz.questions.map((q, i) => (
          <fieldset key={q.id} className="quiz-question" disabled={!enrolled}>
            <legend>
              {i + 1}. {q.prompt} <small>({q.points} балл)</small>
            </legend>
            {q.kind === 'single_choice' ? (
              q.options.map((option, n) => (
                <label className="quiz-option" key={n}>
                  <input type="radio" name={`answer:${q.id}`} value={n} required />
                  <span>{option}</span>
                </label>
              ))
            ) : (
              <textarea
                name={`answer:${q.id}`}
                aria-label={`${i + 1}-сұраққа қысқа жауап`}
                rows={4}
                maxLength={3000}
                required
              />
            )}
          </fieldset>
        ))}
        {enrolled ? (
          <SubmitButton>Жауаптарды тексеруге жіберу</SubmitButton>
        ) : (
          <p className="help-text">
            {preview ? (
              'Оқушы көрінісінде жауап жіберілмейді және баға сақталмайды.'
            ) : userId ? (
              'Жауап беру үшін курс бетінде курсқа жазылыңыз.'
            ) : (
              <>
                <Link
                  href={`/login?next=${encodeURIComponent(`/learn/${lessonId}#knowledge-check`)}`}
                  className="text-link"
                >
                  Кіріңіз
                </Link>{' '}
                және курсқа жазылыңыз.
              </>
            )}
          </p>
        )}
      </form>
    </section>
  );
}
