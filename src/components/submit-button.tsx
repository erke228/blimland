'use client';
import { useFormStatus } from 'react-dom';
export function SubmitButton({
  children,
  className = 'button primary',
  name,
  value,
  disabled = false,
}: {
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending || disabled}
      name={name}
      value={value}
    >
      {pending ? 'Күте тұрыңыз…' : children}
    </button>
  );
}
