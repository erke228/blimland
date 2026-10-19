import { all, one } from './db';
import { actor } from './management';

// These are the only profile fields shared with classmates, including in HTML.
export type BasicPerson = {
  id: string;
  name: string;
  role: 'student' | 'teacher' | 'admin';
};
export type StudyGroup = {
  id: string;
  name: string;
  academic_year: string;
  semester: number;
  teacher: BasicPerson | undefined;
  classmates: BasicPerson[];
};
export function studentGroups(viewerId: string): StudyGroup[] {
  actor(viewerId, ['student']);
  const groups = all<Pick<StudyGroup, 'id' | 'name' | 'academic_year' | 'semester'>>(
    `SELECT g.id, g.name, g.academic_year, g.semester FROM academic_groups g
     JOIN group_members m ON m.group_id = g.id WHERE m.user_id = ?
     ORDER BY g.created_at DESC, g.id`,
    viewerId,
  );
  return groups.map((group) => ({
    ...group,
    teacher: one<BasicPerson>(
      `SELECT u.id, u.name, u.role FROM users u JOIN academic_groups g ON g.owner_id = u.id
       WHERE g.id = ? AND u.status = 'active' AND u.role IN ('teacher', 'admin')`,
      group.id,
    ),
    classmates: all<BasicPerson>(
      `SELECT u.id, u.name, u.role FROM users u JOIN group_members m ON m.user_id = u.id
       WHERE m.group_id = ? AND u.id != ? AND u.status = 'active' ORDER BY u.name, u.id`,
      group.id,
      viewerId,
    ),
  }));
}
export function basicProfile(viewerId: string, personId: string): BasicPerson | undefined {
  const viewer = actor(viewerId);
  const person = one<BasicPerson>(
    "SELECT id, name, role FROM users WHERE id = ? AND status = 'active'",
    personId,
  );
  if (!person) return undefined;
  if (viewer.id === person.id || viewer.role === 'admin') return person;
  const shared =
    viewer.role === 'student'
      ? one(
          `SELECT g.id FROM group_members mine JOIN academic_groups g ON g.id = mine.group_id
         WHERE mine.user_id = ? AND (
           EXISTS (SELECT 1 FROM group_members peer WHERE peer.group_id = g.id AND peer.user_id = ?)
           OR (g.owner_id = ? AND ? IN ('teacher', 'admin'))
         ) LIMIT 1`,
          viewer.id,
          person.id,
          person.id,
          person.role,
        )
      : one(
          `SELECT g.id FROM academic_groups g JOIN group_members m ON m.group_id = g.id
         WHERE g.owner_id = ? AND m.user_id = ? LIMIT 1`,
          viewer.id,
          person.id,
        );
  return shared ? person : undefined;
}
