import { saveGroupAction } from '@/app/management-actions';
import type { Group } from '@/lib/management';
import { SubmitButton } from './submit-button';
export function GroupForm({ group }: { group?: Group }) {
  return (
    <form action={saveGroupAction} className="form-stack">
      <input type="hidden" name="groupId" value={group?.id || ''} />
      <label>
        Топ атауы
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          defaultValue={group?.name}
          placeholder="Мысалы, ИС-24-1"
        />
      </label>
      <label>
        Факультет / кафедра
        <input
          name="department"
          maxLength={180}
          defaultValue={group?.department}
          placeholder="Ақпараттық технологиялар факультеті"
        />
      </label>
      <div className="form-row">
        <label>
          Оқу жылы
          <select name="academicYear" defaultValue={group?.academic_year || '2026–2027'}>
            {['2025–2026', '2026–2027', '2027–2028', '2028–2029', '2029–2030'].map((year) => (
              <option key={year}>{year}</option>
            ))}
          </select>
        </label>
        <label>
          Семестр
          <select name="semester" defaultValue={group?.semester || 1}>
            <option value="1">1-семестр</option>
            <option value="2">2-семестр</option>
            <option value="3">Жазғы семестр</option>
          </select>
        </label>
      </div>
      <label>
        Сипаттама
        <textarea name="description" maxLength={2000} rows={3} defaultValue={group?.description} />
      </label>
      <SubmitButton>{group ? 'Топты сақтау' : 'Топ құру'}</SubmitButton>
    </form>
  );
}
