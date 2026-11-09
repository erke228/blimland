'use client';
import { useId, useState } from 'react';
import { inspectVideoLink } from '@/lib/video-link';
import { VideoPlayer } from './video-player';
import { FilePicker } from './file-picker';
import { sendVideoUpload, VideoUploadError, type VideoUploadStage } from '@/lib/video-upload';

export function LectureVideoField({
  initial = '',
  storedSrc,
  storedSha256,
  lessonId,
  uploadLimit = 4 * 1024 * 1024,
}: {
  initial?: string;
  storedSrc?: string;
  storedSha256?: string;
  lessonId?: string;
  uploadLimit?: number;
}) {
  const [url, setUrl] = useState(initial);
  const [preview, setPreview] = useState<string>();
  const [stored, setStored] = useState(storedSrc);
  const [file, setFile] = useState<File>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploaded, setUploaded] = useState(false);
  const [version, setVersion] = useState(storedSha256);
  const [replaceMode, setReplaceMode] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const [stage, setStage] = useState<VideoUploadStage>();
  const id = useId();
  const state = inspectVideoLink(url);
  const canPreview = !!stored || state === 'candidate';
  async function upload() {
    if (!lessonId || !file || uploading) return;
    const replacing = replaceMode;
    if (replacing && (!confirmed || !version)) return;
    if (!file.name.toLowerCase().endsWith('.mp4') || !file.size || file.size > uploadLimit) {
      setUploadError('MP4 файлын таңдаңыз. Файл 4 МБ-тан аспауы тиіс.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const body = new FormData();
      body.set('file', file);
      if (replacing) {
        body.set('expectedSha256', version!);
        body.set('confirmReplace', 'yes');
      }
      const data = await sendVideoUpload(
        `/learn/${lessonId}/video`,
        body,
        replacing ? 'PUT' : 'POST',
        (next) => {
          setStage((previous) =>
            previous?.kind === next.kind &&
            (next.kind !== 'sending' ||
              (previous.kind === 'sending' && previous.percent === next.percent))
              ? previous
              : next,
          );
        },
      );
      if (!data.ok || data.code !== (replacing ? 'videoreplaced' : 'videouploaded')) {
        const errors: Record<string, string> = {
          videolarge: 'Файл 4 МБ-тан аспауы тиіс.',
          videoquota: 'Курсқа бөлінген бейне орны толды. Әкімшіге хабарласыңыз.',
          videolong: 'Бұл құралда бейне 90 секундтан аспауы тиіс.',
          videoinvalid: 'MP4 файлы оқылмады. Басқа файлды таңдаңыз.',
          videoexists: 'Дәріске бейне тіркелген. Бетті қайта ашып тексеріңіз.',
          videostale: 'Бейне басқа терезеде өзгерген. Мәтінді сақтамай бетті жаңартпаңыз.',
          videoconfirm: 'Алдыңғы бейнені ауыстыруды растаңыз.',
          readonly: 'Курс өңдеуге жабылған. Алдымен оны жобаға қайтарыңыз.',
          forbidden: 'Бұл дәріске бейне қосуға рұқсат жоқ.',
          unauthorized: 'Сеанс аяқталды. Аккаунтыңызға қайта кіріңіз.',
        };
        setUploadError(
          Object.hasOwn(errors, data.code)
            ? errors[data.code]
            : 'Бейне сақталмады. Қайта жүктеп көріңіз.',
        );
        return;
      }
      const nextVersion =
        typeof data.sha256 === 'string' && /^[a-f0-9]{64}$/.test(data.sha256)
          ? data.sha256
          : undefined;
      setVersion(nextVersion);
      setStored(`/learn/${lessonId}/video${nextVersion ? `?v=${nextVersion}` : ''}`);
      setPreview(undefined);
      setUploaded(true);
      setFile(undefined);
      setReplaced(replacing);
      setReplaceMode(false);
      setConfirmed(false);
    } catch (error) {
      setUploadError(
        error instanceof VideoUploadError && error.kind === 'timeout'
          ? 'Серверден жауап кешікті. Бейне тіркелгенін тексеріңіз немесе сол файлды қайта жіберіңіз.'
          : 'Байланыс үзілді. Бейне тіркелгенін тексеріңіз немесе қайта жүктеп көріңіз.',
      );
    } finally {
      setUploading(false);
      setStage(undefined);
    }
  }
  return (
    <div className="form-stack">
      {stored ? (
        <>
          <input type="hidden" name="videoUrl" value={url} />
          <strong>Жүктелген бейнесабақ</strong>
          <p className="muted">Бұл дәріске бейнефайл тіркелген. Студент осы бейнені көреді.</p>
        </>
      ) : (
        <label htmlFor={id}>
          Бейнефайлға HTTPS сілтеме
          <input
            id={id}
            name="videoUrl"
            type="url"
            maxLength={2000}
            value={url}
            placeholder="https://…/lecture.mp4"
            aria-describedby={`${id}-help`}
            onChange={(event) => {
              setUrl(event.target.value);
              setPreview(undefined);
            }}
          />
          <small id={`${id}-help`}>
            Тікелей MP4/WebM файлының сілтемесі қажет. Сайт бетін немесе YouTube/Vimeo көру
            сілтемесін қоспаңыз. Ұзақ бейнелерді жүктеу және транскодтау әлі қосылмаған.
          </small>
        </label>
      )}
      {!stored && state === 'invalid' && (
        <p role="status" className="notice error">
          Құпиясөзсіз HTTPS сілтемесін енгізіңіз.
        </p>
      )}
      {!stored && state === 'page' && (
        <p role="status" className="notice error">
          Бұл — бейнені көру беті. Плеерге тікелей MP4/WebM файлының сілтемесі керек.
        </p>
      )}
      <div className="practice-actions">
        <button
          type="button"
          className="button outline"
          disabled={!canPreview}
          onClick={() => setPreview(stored || url.trim())}
        >
          Бейнені алдын ала көру
        </button>
        {preview && (
          <button type="button" className="button outline" onClick={() => setPreview(undefined)}>
            Алдын ала көруді жабу
          </button>
        )}
      </div>
      {stored && lessonId && version && !replaceMode && (
        <button
          type="button"
          className="button outline"
          onClick={() => {
            setReplaceMode(true);
            setFile(undefined);
            setConfirmed(false);
            setUploadError('');
            setUploaded(false);
          }}
        >
          Бейнені ауыстыру
        </button>
      )}
      {uploaded && (
        <p className="notice" role="status">
          {replaced ? 'Бейне ауыстырылды.' : 'Бейне дәріске тіркелді.'} Мәтіндегі өзгерістерді
          төмендегі батырмамен бөлек сақтаңыз.
        </p>
      )}
      {(!stored || replaceMode) && lessonId && (
        <div className="new-lecture-document" aria-busy={uploading}>
          <h3>{replaceMode ? 'Бейнефайлды ауыстыру' : 'Қысқа MP4 бейнесін қосу'}</h3>
          {replaceMode && (
            <>
              <p className="notice error">
                Алдыңғы бейне тазарту кезінде жойылады, оны осы беттен қайтару мүмкін емес.
                Студенттердің оқу тарихы мен бағалары сақталады.
              </p>
            </>
          )}
          <p className="help-text">
            MP4 · 4 МБ дейін · 90 секундқа дейін. Бейне бөлек сақталады; дәріс мәтіні өзгермейді.
            Ұзақ бейнелер мен үлкен файлдарды жүктеу әлі қосылмаған.
          </p>
          <FilePicker
            name=""
            label="MP4 бейнесін таңдау"
            accept="video/mp4,.mp4"
            help={
              replaceMode
                ? 'Жаңа файлды таңдаңыз, ескертуді оқып, ауыстыруды растаңыз.'
                : 'Файлды таңдағаннан кейін «Бейнені жүктеу» батырмасын басыңыз.'
            }
            disabled={uploading}
            onFile={(next) => {
              setFile(next);
              setUploadError('');
              setConfirmed(false);
            }}
          />
          {replaceMode && (
            <label className="checkbox-label video-replace-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={uploading}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Алдыңғы бейнені ауыстыруға келісемін.
            </label>
          )}
          <button
            type="button"
            className="button outline"
            disabled={!file || uploading || (replaceMode && !confirmed)}
            onClick={() => void upload()}
          >
            {uploading ? 'Жүктелуде…' : replaceMode ? 'Ауыстыруды растау' : 'Бейнені жүктеу'}
          </button>
          {replaceMode && (
            <button
              type="button"
              className="button outline"
              disabled={uploading}
              onClick={() => {
                setReplaceMode(false);
                setFile(undefined);
                setConfirmed(false);
                setUploadError('');
              }}
            >
              Бас тарту
            </button>
          )}
          {uploading && (
            <div>
              {stage?.kind === 'checking' ? (
                <p role="status">Файл жіберілді. Сервер жауабын күтіңіз.</p>
              ) : (
                <>
                  <p role="status">
                    Файл жіберілуде
                    <span aria-hidden="true">
                      {stage?.kind === 'sending' && stage.percent !== undefined
                        ? `: ${stage.percent}%`
                        : '…'}
                    </span>
                  </p>
                  <progress
                    className="video-upload-meter"
                    aria-label="Бейнені жіберу барысы"
                    max={100}
                    value={stage?.kind === 'sending' ? stage.percent : undefined}
                  />
                </>
              )}
            </div>
          )}
          {uploadError && (
            <p className="notice error" role="alert">
              {uploadError}
            </p>
          )}
        </div>
      )}
      {!stored && !lessonId && (
        <p className="help-text">MP4 файлын қосу үшін алдымен дәрісті сақтаңыз.</p>
      )}
      {preview && (
        <div>
          <p className="muted">
            Дыбыс пен бейнені тексеріңіз. Алдын ала көру дәрісті сақтамайды және оқу прогресін
            өзгертпейді.
          </p>
          <VideoPlayer key={preview} src={preview} />
        </div>
      )}
    </div>
  );
}
