import type { Course } from '@/lib/courses';
import { lectureCoverPresentation } from '@/lib/course-covers';
import { selectLectureCover } from '@/app/actions';
import { CourseCover } from './ui';
import { CoverPicker } from './cover-picker';
import { SubmitButton } from './submit-button';
import { FilePicker } from './file-picker';
export async function LectureCoverEditor({
  course,
  lessonId,
}: {
  course: Course;
  lessonId: string;
}) {
  const cover = await lectureCoverPresentation(lessonId);
  return (
    <details className="lecture-cover-settings" id="lecture-cover">
      <summary>Дәрістің жеке мұқабасы</summary>
      <p className="help-text">
        Әр дәріске жеке сурет немесе иллюстрация қоса аласыз. Әдепкіде курстың мұқабасы қолданылады.
      </p>
      <div className="cover-current">
        <CourseCover course={{ ...course, ...cover }} large />
        <span>{cover ? 'Дәрістің жеке мұқабасы' : 'Курстан алынған мұқаба'}</span>
      </div>
      <form
        action="/api/course-covers"
        method="post"
        encType="multipart/form-data"
        className="form-stack cover-upload"
      >
        <input type="hidden" name="courseId" value={course.id} />
        <input type="hidden" name="lessonId" value={lessonId} />
        <FilePicker
          label="Дәріс мұқабасын таңдау"
          accept="image/jpeg,image/png,image/webp"
          required
          image
          previewImage
          help="JPG / PNG / WebP · 5 МБ · 20 Мп · 16:9."
        />
        <SubmitButton className="button outline">Дәріс суретін жүктеу</SubmitButton>
      </form>
      <form action={selectLectureCover} className="form-stack">
        <input type="hidden" name="courseId" value={course.id} />
        <input type="hidden" name="lessonId" value={lessonId} />
        <CoverPicker selected={cover?.cover_preset || course.cover_preset} />
        <SubmitButton className="button outline">Дәріс иллюстрациясын сақтау</SubmitButton>
      </form>
      {cover && (
        <form action={selectLectureCover} className="spaced">
          <input type="hidden" name="courseId" value={course.id} />
          <input type="hidden" name="lessonId" value={lessonId} />
          <input type="hidden" name="coverPreset" value="inherit" />
          <SubmitButton className="button outline">Курстың мұқабасын қолдану</SubmitButton>
        </form>
      )}
    </details>
  );
}
