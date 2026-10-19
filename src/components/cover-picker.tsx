'use client';
import { useState } from 'react';
import { coverPresets } from '@/lib/cover-presets';
import { CoverIllustration } from './cover-illustration';
export function CoverPicker({ selected = 'books' }: { selected?: string }) {
  const [preset, setPreset] = useState(selected);
  return (
    <fieldset className="cover-picker">
      <legend>Дайын иллюстрацияны таңдаңыз</legend>
      <div className="cover-options">
        {coverPresets.map((option) => (
          <label
            className={`cover-option ${preset === option.id ? 'selected' : ''}`}
            key={option.id}
          >
            <input
              type="radio"
              name="coverPreset"
              value={option.id}
              checked={preset === option.id}
              onChange={() => setPreset(option.id)}
            />
            <CoverIllustration preset={option.id} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
