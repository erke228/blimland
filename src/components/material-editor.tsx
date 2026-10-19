import { FileUp } from 'lucide-react';
import { listMaterials } from '@/lib/materials';
import { materialStatusAction } from '@/app/document-actions';
import { SubmitButton } from './submit-button';
export function MaterialEditor({ lessonId, userId }: { lessonId: string; userId: string }) {
  const materials = listMaterials(lessonId, userId, true);
  return (
    <section id="materials" className="material-editor">
      <div className="profile-section-heading">
        <FileUp size={19} />
        <h2>PDF және Word материалдары</h2>
      </div>
      <p className="profile-caption">
        Құжат сабақтың ішінде ашылады. PDF беттері түпнұсқа қалпында, Word (.docx) оқуға ыңғайлы
        көріністе көрсетіледі.
      </p>
      <form
        action="/api/lesson-materials"
        method="post"
        encType="multipart/form-data"
        className="form-stack"
      >
        <input type="hidden" name="lessonId" value={lessonId} />
        <label>
          Құжатты таңдау
          <input
            name="file"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
          />
          <small>
            PDF немесе DOCX, 20 МБ-қа дейін. Бір сабаққа 10 материал. Ескі .doc файлын алдымен .docx
            немесе PDF ретінде сақтаңыз.
          </small>
        </label>
        <SubmitButton className="button outline">Құжатты жүктеу</SubmitButton>
      </form>
      {materials.map((material) => (
        <div className="editor-material" key={material.id}>
          <div>
            <strong>{material.original_name}</strong>
            <small>
              {material.removed_at
                ? 'Сабақтан алынған'
                : `${material.kind.toUpperCase()} · ${material.page_count ? `${material.page_count} бет · ` : ''}${(material.size_bytes / 1024 / 1024).toFixed(1)} МБ`}
            </small>
          </div>
          <form action={materialStatusAction}>
            <input type="hidden" name="materialId" value={material.id} />
            {material.removed_at && <input type="hidden" name="restore" value="yes" />}
            <SubmitButton className="button outline tiny">
              {material.removed_at ? 'Қалпына келтіру' : 'Алып тастау'}
            </SubmitButton>
          </form>
        </div>
      ))}
      <p className="help-text spaced">
        Алып тасталған материал студентке көрінбейді; оны қайта қалпына келтіруге болады.
      </p>
    </section>
  );
}
