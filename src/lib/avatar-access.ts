import { one } from './db';
import { basicProfile } from './student-community';
import { ManagementError } from './management';

export async function canReadAvatar(personId: string, viewerId?: string) {
  if (!/^[a-f0-9-]{36}$/.test(personId)) return false;
  const person = await one<{ role: string; status: string }>(
    'SELECT role,status FROM users WHERE id=?',
    personId,
  );
  if (!person || person.status !== 'active') return false;
  // A published course author's identity picture is visible alongside that course.
  if (
    ['teacher', 'admin'].includes(person.role) &&
    (await one("SELECT id FROM courses WHERE owner_id=? AND status='published' LIMIT 1", personId))
  )
    return true;
  if (!viewerId) return false;
  try {
    return !!(await basicProfile(viewerId, personId));
  } catch (error) {
    if (error instanceof ManagementError && error.code === 'forbidden') return false;
    throw error;
  }
}
