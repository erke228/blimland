import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { one } from './db';
import { tokenHash } from './security';

export type User = {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  department: string;
  academic_title: string;
};
export const SESSION_COOKIE = 'bilimhub_session';
export async function currentUser(): Promise<User | undefined> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  return one<User>(
    `SELECT u.id, u.name, u.email, u.role, u.department, u.academic_title FROM users u JOIN sessions s ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`,
    tokenHash(token),
    Date.now(),
  );
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}
export async function requireRole(...roles: User['role'][]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect('/dashboard?error=forbidden');
  return user;
}
