'use client';
import { useRef, useState } from 'react';
import { LectureText } from './lecture-text';
export function LectureTextEditor({ initial = '' }: { initial?: string }) {
  const [text, setText] = useState(initial),
    [preview, setPreview] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  function insert(value: string) {
    const input = field.current,
      start = input?.selectionStart ?? text.length,
      end = input?.selectionEnd ?? text.length;
    const prefix = start && text[start - 1] !== '\n' ? '\n\n' : '';
    const next = text.slice(0, start) + prefix + value + '\n\n' + text.slice(end);
    if (next.length > 30000) return;
    setText(next);
    setPreview(false);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(start + prefix.length, start + prefix.length + value.length);
    });
  }
  return (
    <div className="lecture-text-editor">
      <div className="practice-actions" role="group" aria-label="Мәтін блоктарын қосу">
        <button type="button" className="button outline" onClick={() => insert('# Тақырып')}>
          Тақырып қосу
        </button>
        <button
          type="button"
          className="button outline"
          onClick={() => insert('- Бірінші тармақ\n- Екінші тармақ')}
        >
          Тізім қосу
        </button>
        <button
          type="button"
          className="button outline"
          onClick={() => insert('```python\nprint("Сәлем, STEM!")\n```')}
        >
          Код мысалын қосу
        </button>
        <button
          type="button"
          className="button outline"
          aria-pressed={preview}
          onClick={() => setPreview(!preview)}
        >
          {preview ? 'Мәтінді өңдеу' : 'Мәтінді алдын ала көру'}
        </button>
      </div>
      <label htmlFor="lecture-body">Дәріс мәтіні</label>
      <textarea
        id="lecture-body"
        ref={field}
        name="body"
        rows={12}
        maxLength={30000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        hidden={preview}
        aria-describedby="lecture-body-help"
      />
      <p id="lecture-body-help" className="help-text">
        Мәтін, тақырып, тізім және код блоктарын араластырыңыз. Код орындалмайды, оқу мысалы ретінде
        көрсетіледі. PDF / Word қолдансаңыз, мәтін міндетті емес.
      </p>
      {preview && (
        <div className="panel lesson-body" aria-label="Мәтіннің алдын ала көрінісі">
          {text.trim() ? <LectureText text={text} /> : <p>Алдымен мәтін енгізіңіз.</p>}
        </div>
      )}
    </div>
  );
}
