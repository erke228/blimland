'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Check, BookOpen } from 'lucide-react';
import { levels } from '@/lib/cover-presets';
import { CoverPicker } from './cover-picker';
import { CoverIllustration } from './cover-illustration';
import { FilePicker } from './file-picker';
const steps = ['Курс туралы', 'Мұқаба', 'Дайындық'];
export function CourseWizard() {
  const [step, setStep] = useState(0),
    [mode, setMode] = useState('upload'),
    [preview, setPreview] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [category, setCategory] = useState('Технология'),
    [preset, setPreset] = useState('books');
  const form = useRef<HTMLFormElement>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function next() {
    const panel = form.current?.querySelector(`[data-step="${step}"]`);
    for (const field of panel?.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('input,textarea,select') || [])
      if (!field.reportValidity()) return;
    setError('');
    setStep(step + 1);
  }
  return (
    <div className="course-wizard">
      <ol className="wizard-steps">
        {steps.map((label, index) => (
          <li key={label} className={index === step ? 'current' : index < step ? 'complete' : ''}>
            <span>{index < step ? <Check size={16} /> : index + 1}</span>
            <b>{label}</b>
          </li>
        ))}
      </ol>
      <form
        ref={form}
        action="/api/courses"
        method="post"
        encType="multipart/form-data"
        className="panel form-stack wizard-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          if (step !== 2) {
            next();
            return;
          }
          setBusy(true);
          setError('');
          try {
            const response = await fetch('/api/courses', {
              method: 'POST',
              body: new FormData(form.current!),
              headers: { Accept: 'application/json' },
            });
            const data = await response.json();
            if (response.ok && data.redirect) {
              location.assign(data.redirect);
              return;
            }
            setError(
              ['coverinvalid', 'coversize'].includes(data.error)
                ? 'JPG, PNG немесе WebP суретін таңдаңыз: 5 МБ дейін, 20 Мп дейін.'
                : 'Мәліметтерді тексеріңіз. Атау 5–140, сипаттама 30–5000 таңба болуы тиіс.',
            );
            if (['coverinvalid', 'coversize'].includes(data.error)) setStep(1);
          } catch {
            setError('Сақтау орындалмады. Байланысты тексеріп, қайта көріңіз.');
          }
          setBusy(false);
        }}
      >
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <section data-step="0" hidden={step !== 0}>
          <span className="eyebrow">1 / 3</span>
          <h2>Курс туралы қысқаша</h2>
          <p className="help-text">
            Алдымен негізгі мәліметтер. Курс жасалған соң дәрістерді қоса аласыз.
          </p>
          <div className="form-stack">
            <label>
              Курс атауы
              <input
                name="title"
                required
                minLength={5}
                maxLength={140}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Мысалы: Табиғи тілді өңдеу"
              />
            </label>
            <label>
              Сипаттама
              <textarea
                name="description"
                required
                minLength={30}
                maxLength={5000}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Курс кімге арналған және студент нені үйренеді?"
              />
            </label>
            <div className="form-row">
              <label>
                Білім бағыты
                <input
                  name="category"
                  required
                  minLength={2}
                  maxLength={100}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </label>
              <label>
                Деңгей
                <select name="level">
                  {levels.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>
        <section data-step="1" hidden={step !== 1}>
          <span className="eyebrow">2 / 3</span>
          <h2>Курстың мұқабасы</h2>
          <p className="help-text">
            Өз баннеріңізді қазір жүктеңіз немесе дайын иллюстрацияны таңдаңыз.
          </p>
          <div className="cover-mode">
            <label className={mode === 'upload' ? 'selected' : ''}>
              <input
                type="radio"
                name="coverMode"
                value="upload"
                checked={mode === 'upload'}
                onChange={() => setMode('upload')}
              />
              <ImagePlus size={18} />
              Өз баннерім
            </label>
            <label className={mode === 'preset' ? 'selected' : ''}>
              <input
                type="radio"
                name="coverMode"
                value="preset"
                checked={mode === 'preset'}
                onChange={() => setMode('preset')}
              />
              <BookOpen size={18} />
              Дайын иллюстрация
            </label>
          </div>
          <div hidden={mode !== 'upload'} className="banner-start-upload">
            <FilePicker
              label="Курс баннерін таңдау"
              accept="image/jpeg,image/png,image/webp"
              image
              help="JPG / PNG / WebP · 5 МБ дейін · 16:9. Файл таңдалмаса, дайын мұқаба қолданылады."
              onFile={(file) => {
                if (preview) URL.revokeObjectURL(preview);
                setPreview(file ? URL.createObjectURL(file) : '');
              }}
            />
            {preview && (
              <img
                className="banner-preview"
                src={preview}
                alt="Курс баннерінің алдын ала көрінісі"
              />
            )}
          </div>
          <div
            hidden={mode !== 'preset'}
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              if (input.name === 'coverPreset') setPreset(input.value);
            }}
          >
            <CoverPicker />
          </div>
        </section>
        <section data-step="2" hidden={step !== 2}>
          <span className="eyebrow">3 / 3</span>
          <h2>Тексеріп, курсты жасаңыз</h2>
          <div className="wizard-review-cover">
            {mode === 'upload' && preview ? (
              <img src={preview} alt="Курс мұқабасы" />
            ) : (
              <CoverIllustration preset={preset} />
            )}
          </div>
          <h3>{title || 'Курс атауы'}</h3>
          <p className="wizard-description">{description}</p>
          <span className="category-label">{category}</span>
          <p className="notice">
            Курс жоба ретінде сақталады. Кейін бөлімдер мен дәрістер қосып, жариялауға жібересіз.
          </p>
        </section>
        <div className="wizard-navigation">
          {step > 0 && (
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={17} />
              Артқа
            </button>
          )}
          {step < 2 ? (
            <button
              key="next"
              type="button"
              className="button primary"
              onClick={(event) => {
                event.preventDefault();
                next();
              }}
            >
              Келесі
              <ArrowRight size={17} />
            </button>
          ) : (
            <button key="create" className="button primary" type="submit" disabled={busy}>
              {busy ? 'Сақталуда…' : 'Курсты жасау'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
