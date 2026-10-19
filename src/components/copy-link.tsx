'use client';
import { useState } from 'react';
import { Copy } from 'lucide-react';
export function CopyLink({ value }: { value: string }) {
  const [state, setState] = useState('');
  return (
    <div className="copy-link">
      <input
        readOnly
        value={value}
        aria-label="Шақыру сілтемесі"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="button outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setState('Көшірілді');
          } catch {
            setState('Сілтемені белгілеп, қолмен көшіріңіз');
          }
        }}
      >
        <Copy size={16} />
        Көшіру
      </button>
      {state && <small role="status">{state}</small>}
    </div>
  );
}
