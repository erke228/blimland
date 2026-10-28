import type { Course } from '@/lib/courses';
import { levels } from '@/lib/cover-presets';
export function CourseFields({ course }: { course?: Course }) {
  return (
    <>
      <label>
        Курс атауы
        <input name="title" required minLength={5} maxLength={140} defaultValue={course?.title} />
        <small>Университет пәні немесе дәрістер топтамасының атауы.</small>
      </label>
      <label>
        Толық сипаттама
        <textarea
          name="description"
          required
          minLength={30}
          maxLength={5000}
          rows={5}
          defaultValue={course?.description}
        />
        <small>Курс кімге арналған, қандай тақырыптар қаралады және бастапқы дайындық.</small>
      </label>
      <div className="form-row">
        <label>
          Білім бағыты
          <input
            name="category"
            list="course-categories"
            required
            minLength={2}
            maxLength={100}
            defaultValue={course?.category || 'Технология'}
          />
          <datalist id="course-categories">
            {[
              'Технология',
              'Информатика',
              'Тіл білімі',
              'Жаратылыстану',
              'Гуманитарлық ғылымдар',
              'Басқа',
            ].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <small>Тізімнен таңдаңыз немесе өз бағытыңызды жазыңыз.</small>
        </label>
        <label>
          Деңгей
          <select name="level" defaultValue={course?.level || 'Бастапқы'}>
            {levels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
