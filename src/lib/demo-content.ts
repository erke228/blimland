import { all, run, transaction } from './db';
import { randomUUID } from 'node:crypto';
export async function archiveDemoContent() {
  // Match both the known seed owner and IDs. Never infer demos from a subject.
  const demos = await all<{
    id: string;
    owner_id: string;
  }>(`SELECT c.id,c.owner_id FROM courses c JOIN users u ON u.id=c.owner_id
    WHERE u.email='demo-author@example.invalid' AND c.id IN ('algebra-basics','kazakh-writing','digital-skills') AND c.status!='archived'`);
  await transaction(
    async () =>
      await Promise.all(
        demos.map(async (course) => {
          await run(
            "UPDATE courses SET status='archived',updated_at=? WHERE id=?",
            Date.now(),
            course.id,
          );
          await run(
            'INSERT INTO audit_log VALUES (?,?,?,?,?)',
            randomUUID(),
            course.owner_id,
            'course.demo.archived',
            course.id,
            Date.now(),
          );
        }),
      ),
  );
  return demos.length;
}
