'use client';
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

// Desktop content stays visible; the phone gets a compact, keyboard-accessible control.
export function MobileDisclosure({
  title,
  summary,
  children,
  className = '',
  desktopHeading = false,
  filter = false,
  badge,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  className?: string;
  desktopHeading?: boolean;
  filter?: boolean;
  badge?: number;
}) {
  const [open, setOpen] = useState(false),
    id = useId();
  return (
    <div className={`mobile-disclosure ${open ? 'is-open' : ''} ${className}`}>
      {desktopHeading && <h3 className="disclosure-desktop-heading">{title}</h3>}
      <button
        type="button"
        className="disclosure-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {filter && <SlidersHorizontal size={19} aria-hidden="true" />}
        <span>
          <strong>{title}</strong>
          {summary && <small>{summary}</small>}
        </span>
        {!!badge && <span className="disclosure-badge">{badge}</span>}
        <ChevronDown size={19} aria-hidden="true" />
      </button>
      <div id={id} className="disclosure-content">
        {children}
      </div>
    </div>
  );
}
