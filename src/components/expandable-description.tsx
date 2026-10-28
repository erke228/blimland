'use client';
import { useId, useState } from 'react';
export function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false),
    id = useId();
  return (
    <div
      className={`course-description-block ${text.length > 180 ? 'is-collapsible' : ''} ${expanded ? 'is-expanded' : ''}`}
    >
      <p id={id} className="detail-description">
        {text}
      </p>
      {text.length > 180 && (
        <button
          className="description-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Жинау' : 'Толығырақ оқу'}
        </button>
      )}
    </div>
  );
}
