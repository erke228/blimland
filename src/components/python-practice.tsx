'use client';
import { useEffect, useRef, useState } from 'react';
import type { Practice } from '@/lib/practices';
export function PythonPractice({ practice, lessonId }: { practice: Practice; lessonId: string }) {
  const [code, setCode] = useState(practice.starter_code);
  const [active, setActive] = useState(false);
  const [running, setRunning] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const request = useRef('');
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.source === frame.current?.contentWindow &&
        event.data?.type === 'lab-done' &&
        event.data.requestId === request.current
      )
        setRunning(false);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);
  function run() {
    request.current = crypto.randomUUID();
    setRunning(true);
    if (frame.current)
      frame.current.contentWindow?.postMessage(
        { type: 'lab-run', code, requestId: request.current },
        '*',
      );
    else setActive(true);
  }
  return (
    <section className="panel python-practice" id="python-practice">
      <span className="eyebrow">PYTHON ПРАКТИКУМЫ</span>
      <h2>{practice.title}</h2>
      <p>{practice.instructions}</p>
      <p className="help-text">
        Код браузерде орындалады. Алғашқы жүктеуге интернет қажет. TensorFlow және Streamlit толық
        ноутбук арқылы іске қосылады.
      </p>
      <label htmlFor={`code-${lessonId}`}>Кодты өзгертіп, іске қосыңыз</label>
      <textarea
        id={`code-${lessonId}`}
        className="python-code"
        rows={13}
        spellCheck={false}
        value={code}
        maxLength={30000}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className="practice-actions">
        <button
          className="button primary"
          type="button"
          onClick={run}
          disabled={running || !code.trim()}
        >
          ▶ Іске қосу
        </button>
        <button
          className="button outline"
          type="button"
          disabled={!running}
          onClick={() => {
            frame.current?.contentWindow?.postMessage({ type: 'lab-stop' }, '*');
            setRunning(false);
          }}
        >
          Тоқтату
        </button>
        <button
          type="button"
          className="button outline"
          disabled={running}
          onClick={() => setCode(practice.starter_code)}
        >
          Бастапқы код
        </button>
      </div>
      {running && <p role="status">Python ортасы дайындалуда немесе код орындалуда…</p>}
      {active && (
        <iframe
          ref={frame}
          className="python-output"
          src="/python-lab.html"
          sandbox="allow-scripts"
          title="Python орындалу нәтижесі"
          onLoad={() =>
            frame.current?.contentWindow?.postMessage(
              { type: 'lab-run', code, requestId: request.current },
              '*',
            )
          }
        />
      )}
      {practice.expected_output && (
        <details>
          <summary>Нәтижені салыстыру</summary>
          <pre>{practice.expected_output}</pre>
        </details>
      )}
      <div className="practice-actions">
        <a className="text-link" href={`/learn/${lessonId}/practice`}>
          Толық ноутбук (.ipynb) ↓
        </a>
        <a className="text-link" href={`/learn/${lessonId}/practice?format=py`}>
          Python файлы ↓
        </a>
        <a className="text-link" href={`/learn/${lessonId}/practice?format=requirements`}>
          Кітапханалар тізімі ↓
        </a>
      </div>
    </section>
  );
}
