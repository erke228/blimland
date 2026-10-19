'use client';
import { useFormStatus } from 'react-dom';
export function SubmitButton({
  children,
  className = 'button primary',
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? 'Күте тұрыңыз…' : children}
    </button>
  );
}
