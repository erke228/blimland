'use client';
import { useRef, useState } from 'react';
export function VideoPlayer({ src }: { src: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  return (
    <div className="video-container">
      <video
        ref={video}
        src={src}
        controls
        preload="metadata"
        playsInline
        onError={() => setError(true)}
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
      {error && (
        <div className="notice error">
          Бейне ашылмады. Оқытушыға хабарлаңыз. Сілтеме тікелей бейнефайлға бағытталуы тиіс.
        </div>
      )}
    </div>
  );
}
