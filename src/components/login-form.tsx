'use client';

import { useActionState } from 'react';
import { login } from '@/app/actions';
import { FocusedNotice } from './focused-notice';
import { SubmitButton } from './submit-button';

const loginErrors = {
  credentials: 'Email немесе құпиясөз дұрыс емес.',
  rate: 'Тым көп әрекет жасалды. Кейінірек қайталаңыз.',
};

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(
    login,
    { email: '' },
    next ? `/login?next=${encodeURIComponent(next)}` : '/login',
  );

  return (
    <form action={action} className="form-stack">
      {state.error && (
        <FocusedNotice id="login-error" message={loginErrors[state.error]} error focusOn={state} />
      )}
      <input type="hidden" name="next" value={next} />
      <label>
        Email
        <input
          key={state.email}
          type="email"
          name="email"
          defaultValue={state.email}
          required
          maxLength={254}
          autoComplete="username"
          placeholder="name@example.kz"
        />
      </label>
      <label>
        Құпиясөз
        <input
          type="password"
          name="password"
          required
          maxLength={128}
          autoComplete="current-password"
        />
      </label>
      <SubmitButton>Кіру →</SubmitButton>
    </form>
  );
}
