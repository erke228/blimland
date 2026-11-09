'use client';

import { useActionState } from 'react';
import { register } from '@/app/actions';
import { FocusedNotice } from './focused-notice';
import { SubmitButton } from './submit-button';

const errors = {
  registration: 'Атыңызды, дұрыс email және кемінде 12 таңбалы құпиясөзді енгізіңіз.',
  rate: 'Тым көп әрекет жасалды. Кейінірек қайталаңыз.',
  email: 'Бұл email арқылы тіркелу мүмкін болмады. Егер аккаунтыңыз болса, кіріңіз.',
};

export function RegisterForm({ next }: { next: string }) {
  const [state, action] = useActionState(
    register,
    { name: '', email: '' },
    next ? `/register?next=${encodeURIComponent(next)}` : '/register',
  );

  return (
    <form action={action} className="form-stack">
      {state.error && (
        <FocusedNotice id="register-error" message={errors[state.error]} error focusOn={state} />
      )}
      <input type="hidden" name="next" value={next} />
      <label>
        Аты-жөніңіз
        <input
          key={state.name}
          name="name"
          defaultValue={state.name}
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
        />
      </label>
      <label>
        Email
        <input
          key={state.email}
          type="email"
          name="email"
          defaultValue={state.email}
          required
          maxLength={254}
          autoComplete="email"
          placeholder="name@example.kz"
        />
      </label>
      <label>
        Құпиясөз
        <input
          type="password"
          name="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
        <small>Кемінде 12 таңба қолданыңыз.</small>
      </label>
      <SubmitButton>Тіркелу →</SubmitButton>
    </form>
  );
}
