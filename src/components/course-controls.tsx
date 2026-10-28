import { courseLifecycleAction } from '@/app/course-lifecycle-actions';
import { SubmitButton } from './submit-button';
import { EyeOff, Trash2, RotateCcw } from 'lucide-react';
export function CourseControls({
  id,
  title,
  status,
  inTrash = false,
  admin = false,
  returnTo = '/teacher',
}: {
  id: string;
  title: string;
  status: string;
  inTrash?: boolean;
  admin?: boolean;
  returnTo?: string;
}) {
  const fields = (
    <>
      <input type="hidden" name="courseId" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
  return (
    <div className="course-controls">
      {!inTrash && status !== 'archived' && (
        <form action={courseLifecycleAction}>
          {fields}
          <input type="hidden" name="operation" value="hide" />
          <SubmitButton className="button outline tiny">
            <EyeOff size={14} />
            Жасыру
          </SubmitButton>
        </form>
      )}
      {(inTrash || status === 'archived') && (
        <form action={courseLifecycleAction}>
          {fields}
          <input type="hidden" name="operation" value="restore" />
          <SubmitButton className="button outline tiny">
            <RotateCcw size={14} />
            Жобаға қайтару
          </SubmitButton>
        </form>
      )}
      {!inTrash && (
        <details className="course-delete-menu">
          <summary className="button outline tiny danger-text">
            <Trash2 size={14} />
            Жою
          </summary>
          <div className="delete-confirmation">
            <p>
              «{title}» себетке көшеді және студенттерге жабылады. Оны қалпына келтіруге болады.
            </p>
            <form action={courseLifecycleAction}>
              {fields}
              <input type="hidden" name="operation" value="trash" />
              <SubmitButton className="button danger">Себетке жіберу</SubmitButton>
            </form>
          </div>
        </details>
      )}
      {inTrash && admin && (
        <details className="course-delete-menu">
          <summary className="button outline tiny danger-text">
            <Trash2 size={14} />
            Толық жою
          </summary>
          <form action={courseLifecycleAction} className="form-stack delete-confirmation">
            {fields}
            <input type="hidden" name="operation" value="purge" />
            <p>
              Курс, барлық дәрістер, құжаттар, топтарға тағайындаулар және осы курстың оқу тарихы
              біржола өшіріледі. Қалпына келтіру мүмкін емес.
            </p>
            <label>
              Растау үшін курс атауын жазыңыз
              <input name="confirmTitle" required autoComplete="off" placeholder={title} />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="confirm" required />
              Толық жоюды растаймын
            </label>
            <SubmitButton className="button danger">Біржола жою</SubmitButton>
          </form>
        </details>
      )}
    </div>
  );
}
