'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
export function VideoPlayer({
  src,
  progress,
}: {
  src: string;
  progress?: { lessonId: string; initialPosition: number };
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const ready = useRef(false);
  const lastAttempt = useRef(0);
  const saved = useRef(progress?.initialPosition ?? 0);
  const pending = useRef<number | null>(null);
  const saving = useRef(false);
  const lessonId = progress?.lessonId;
  const initialPosition = progress?.initialPosition ?? 0;
  const initialize = useCallback(
    (element: HTMLVideoElement) => {
      if (ready.current) return;
      if (
        initialPosition > 0 &&
        Number.isFinite(element.duration) &&
        initialPosition < element.duration - 1
      )
        element.currentTime = initialPosition;
      ready.current = true;
    },
    [initialPosition],
  );
  const save = useCallback(
    async (position: number, force = false) => {
      if (!lessonId || !ready.current || !Number.isFinite(position)) return;
      if (!force && Date.now() - lastAttempt.current < 15000) return;
      if (!saving.current && Math.abs(saved.current - position) < 0.5) return;
      lastAttempt.current = Date.now();
      pending.current = position;
      // Serialize requests so a slower earlier save cannot overwrite a later seek.
      if (saving.current) return;
      saving.current = true;
      try {
        while (pending.current !== null) {
          const next = pending.current;
          pending.current = null;
          if (Math.abs(saved.current - next) < 0.5) continue;
          const form = new FormData();
          form.set('position', String(next));
          try {
            const response = await fetch(`/learn/${lessonId}/video/progress`, {
              method: 'POST',
              body: form,
              credentials: 'same-origin',
              keepalive: true,
            });
            if (!response.ok) throw new Error('Position was not saved');
            saved.current = next;
            setSaveError(false);
          } catch {
            setSaveError(true);
          }
        }
      } finally {
        saving.current = false;
      }
    },
    [lessonId],
  );
  useEffect(() => {
    const element = video.current;
    // Metadata may arrive before React hydrates the server-rendered video.
    if (element && element.readyState >= 1) initialize(element);
    const flush = () => {
      if (element) void save(element.currentTime, true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [save, initialize]);
  return (
    <div className="video-container">
      <video
        ref={video}
        src={src}
        controls
        preload="metadata"
        playsInline
        onError={() => setError(true)}
        onLoadedMetadata={(event) => initialize(event.currentTarget)}
        onTimeUpdate={(event) => void save(event.currentTarget.currentTime)}
        onPause={(event) => void save(event.currentTarget.currentTime, true)}
        onSeeked={(event) => void save(event.currentTarget.currentTime, true)}
        onEnded={(event) => void save(event.currentTarget.currentTime, true)}
      />
      <div className="video-tools">
        <label>
          Жылдамдық{' '}
          <select
            defaultValue="1"
            onChange={(event) => {
              if (video.current) video.current.playbackRate = Number(event.target.value);
            }}
          >
            <option value="0.75">0.75×</option>
            <option value="1">1×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>
        </label>
      </div>
      {progress && (
        <p className="video-progress-note">
          Қараған жеріңіз сақталады. Бейне көру дәрісті автоматты аяқтамайды.
        </p>
      )}
      {saveError && (
        <div className="notice error" role="status">
          Қараған жеріңіз сақталмады. Байланысты тексеріңіз.
          <button
            type="button"
            className="button outline"
            onClick={() => {
              if (video.current) void save(video.current.currentTime, true);
            }}
          >
            Қайта сақтау
          </button>
        </div>
      )}
      {error && (
        <div className="notice error">
          Бейне ашылмады. Оқытушыға хабарлаңыз. Сілтеме тікелей бейнефайлға бағытталуы тиіс.
        </div>
      )}
    </div>
  );
}
