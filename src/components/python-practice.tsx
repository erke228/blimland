'use client';
import { useEffect, useRef, useState } from 'react';
import type { Practice } from '@/lib/practices';

function syncOutputTheme(frame: HTMLIFrameElement | null) {
  frame?.contentWindow?.postMessage(
    {
      type: 'lab-theme',
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    },
    '*',
  );
}

export function PythonPractice({ practice, lessonId }: { practice: Practice; lessonId: string }) {
  const [code, setCode] = useState(practice.starter_code);
  const [active, setActive] = useState(false);
  const [running, setRunning] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const request = useRef<{ requestId: string; code: string } | null>(null);
  useEffect(() => {
    if (!active) return;
    const observer = new MutationObserver(() => syncOutputTheme(frame.current));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.source === frame.current?.contentWindow &&
        event.data?.type === 'lab-done' &&
        request.current &&
        event.data.requestId === request.current.requestId
      ) {
        request.current = null;
        setRunning(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);
  function sendRequest(target: HTMLIFrameElement | null) {
    if (request.current)
      target?.contentWindow?.postMessage({ type: 'lab-run', ...request.current }, '*');
  }
  function run() {
    request.current = { requestId: crypto.randomUUID(), code };
    setRunning(true);
    if (ready.current) sendRequest(frame.current);
    else setActive(true);
  }
  function stop() {
    request.current = null;
    if (ready.current) frame.current?.contentWindow?.postMessage({ type: 'lab-stop' }, '*');
    else setActive(false);
    setRunning(false);
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
        <button className="button outline" type="button" disabled={!running} onClick={stop}>
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
          onLoad={(event) => {
            if (frame.current !== event.currentTarget) return;
            ready.current = true;
            syncOutputTheme(event.currentTarget);
            sendRequest(event.currentTarget);
          }}
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
