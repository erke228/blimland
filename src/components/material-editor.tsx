import Link from 'next/link';
import { FileUp, ExternalLink } from 'lucide-react';
import { listMaterials } from '@/lib/materials';
import { materialStatusAction } from '@/app/document-actions';
import { SubmitButton } from './submit-button';
import { DocumentFileInput } from './document-file-input';
import { reopenCourseForEditing } from '@/app/actions';
export async function MaterialEditor({
  lessonId,
  userId,
  courseId,
  readOnly = false,
  archived = false,
}: {
  lessonId: string;
  userId: string;
  courseId: string;
  readOnly?: boolean;
  archived?: boolean;
}) {
  const materials = await listMaterials(lessonId, userId, !readOnly);
  return (
    <section id="materials" className="material-editor prominent-materials">
      <div className="profile-section-heading">
        <FileUp size={19} />
        <h2>PDF және Word материалдары</h2>
      </div>
      <p className="profile-caption">
        Құжат сабақтың ішінде ашылады. PDF беттері түпнұсқа қалпында, Word (.docx) оқуға ыңғайлы
        көріністе көрсетіледі.
      </p>
      {readOnly ? (
        <div className="document-edit-notice">
          <p className="help-text">
            {archived
              ? 'Құжат қосу үшін бас әкімші курсты архивтен қайтаруы тиіс.'
              : 'PDF немесе Word қосу үшін курсты өңдеуге ашыңыз. Қайта мақұлданғанша курс студенттерге уақытша жабылады; файлдар мен оқу тарихы сақталады.'}
          </p>
          {!archived && (
            <form action={reopenCourseForEditing}>
              <input type="hidden" name="courseId" value={courseId} />
              <input type="hidden" name="lessonId" value={lessonId} />
              <SubmitButton className="button outline">Құжат қосу үшін өңдеуді ашу</SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <form
          action="/api/lesson-materials"
          method="post"
          encType="multipart/form-data"
          className="form-stack"
        >
          <input type="hidden" name="lessonId" value={lessonId} />
          <DocumentFileInput required />
          <SubmitButton className="button primary">
            <FileUp size={17} />
            PDF / Word жүктеу
          </SubmitButton>
        </form>
      )}
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
          <div className="material-actions">
            {!material.removed_at && (
              <Link
                className="button outline tiny"
                href={`/materials/${material.id}/${material.kind === 'pdf' ? 'file' : 'preview'}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} />
                Ашу
              </Link>
            )}
            {!readOnly && (
              <form action={materialStatusAction}>
                <input type="hidden" name="materialId" value={material.id} />
                {material.removed_at && <input type="hidden" name="restore" value="yes" />}
                <SubmitButton className="button outline tiny">
                  {material.removed_at ? 'Қалпына келтіру' : 'Алып тастау'}
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      ))}
      {!readOnly && (
        <p className="help-text spaced">
          Алып тасталған материал студентке көрінбейді; оны қайта қалпына келтіруге болады.
        </p>
      )}
    </section>
  );
}
