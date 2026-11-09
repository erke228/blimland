'use client';

import { useEffect, useRef } from 'react';

export function FocusedNotice({
  id,
  message,
  error,
  focusOn,
}: {
  id: string;
  message: string;
  error: boolean;
  focusOn?: object;
}) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    notice.current?.focus();
  }, [message, error, focusOn]);

  return (
    <div
      ref={notice}
      id={id}
      className={error ? 'notice error' : 'notice success'}
      role={error ? 'alert' : 'status'}
      tabIndex={-1}
    >
      {message}
    </div>
  );
}
