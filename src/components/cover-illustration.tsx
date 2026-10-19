import {
  Atom,
  BookOpen,
  BrainCircuit,
  GraduationCap,
  Languages,
  Monitor,
  Play,
  Sigma,
} from 'lucide-react';
import { coverPresets } from '@/lib/cover-presets';
const icons = {
  books: BookOpen,
  video: Play,
  technology: Monitor,
  languages: Languages,
  mathematics: Sigma,
  university: GraduationCap,
  brain: BrainCircuit,
  science: Atom,
};
export function CoverIllustration({
  preset = 'books',
  large = false,
}: {
  preset?: string;
  large?: boolean;
}) {
  const option = coverPresets.find((item) => item.id === preset) || coverPresets[0];
  const Icon = icons[option.id];
  return (
    <div
      className={`course-cover ${option.accent} ${large ? 'large' : ''} illustration-${option.id}`}
      aria-hidden="true"
    >
      <span className="cover-grid" />
      <span className="cover-symbol">
        <Icon strokeWidth={1.3} />
      </span>
      <span className="cover-mini-card">
        <BookOpen size={18} />
        <i />
        <i />
      </span>
      <span className="cover-star">✦</span>
      <span className="cover-caption">BILIM / {option.label.toLocaleUpperCase('kk-KZ')}</span>
      <span className="cover-orbit orbit-one" />
      <span className="cover-orbit orbit-two" />
    </div>
  );
}
