'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';

type Preference = 'system' | 'light' | 'dark';
const key = 'bilimhub-theme';
export function ThemeControl() {
  const [preference, setPreference] = useState<Preference>('system');
  const menu = useRef<HTMLDetailsElement>(null);
  const currentPreference = useRef<Preference>('system');
  const apply = (value: Preference) => {
    const dark =
      value === 'dark' ||
      (value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#101916' : '#f5f8f6');
  };
  useEffect(() => {
    let current: Preference = 'system';
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'light' || saved === 'dark') current = saved;
    } catch {}
    currentPreference.current = current;
    setPreference(current);
    apply(current);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const systemChanged = () => {
      if (currentPreference.current === 'system') apply('system');
    };
    const stored = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      current = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system';
      currentPreference.current = current;
      setPreference(current);
      apply(current);
    };
    media.addEventListener('change', systemChanged);
    window.addEventListener('storage', stored);
    const outside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      media.removeEventListener('change', systemChanged);
      window.removeEventListener('storage', stored);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  function choose(value: Preference) {
    currentPreference.current = value;
    setPreference(value);
    apply(value);
    try {
      localStorage.setItem(key, value);
    } catch {}
    if (menu.current) menu.current.open = false;
    menu.current?.querySelector('summary')?.focus();
  }
  return (
    <details
      className="theme-menu"
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu.current?.open) {
          menu.current.open = false;
          menu.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary aria-label="Түс тақырыбын таңдау" title="Түс тақырыбы">
        <Sun className="theme-light-icon" size={19} />
        <Moon className="theme-dark-icon" size={19} />
        <span>Тақырып</span>
      </summary>
      <div className="theme-options" role="group" aria-label="Түс тақырыбы">
        {(
          [
            ['system', 'Жүйе бойынша', Monitor],
            ['light', 'Жарық', Sun],
            ['dark', 'Қараңғы', Moon],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            type="button"
            key={value}
            aria-pressed={preference === value}
            onClick={() => choose(value)}
          >
            <Icon size={18} />
            <span>{label}</span>
            {preference === value && <Check size={16} />}
          </button>
        ))}
      </div>
    </details>
  );
}
