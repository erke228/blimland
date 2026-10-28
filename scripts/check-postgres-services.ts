import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnvironment } from './postgres-environment';
import { one, run, transaction } from '../src/lib/db';
import { hashPassword, rateLimit } from '../src/lib/security';
import { saveGroup, newInvite, acceptInvitation } from '../src/lib/management';
import { getStored, putStored, deleteStored } from '../src/lib/storage';
if (!process.env.APP_ENV_FILE) throw Error('An explicit verification env file is required.');
loadEnvironment();
if (!process.env.NEON_BRANCH?.startsWith('codex-bilimhub-verify'))
  throw Error('Refusing test mutations outside the isolated branch.');
process.env.DATABASE_DRIVER = 'postgres';
process.env.STORAGE_DRIVER = 'neon';
const admin = (await one<{ id: string }>("SELECT id FROM users WHERE role='admin'"))!.id;
const students = [randomUUID(), randomUUID()];
for (const id of students)
  await run(
    'INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)',
    id,
    `${id}@concurrency.invalid`,
    'Оқушы',
    hashPassword(randomUUID()),
    'student',
    Date.now(),
  );
const group = await saveGroup(admin, {
  name: 'Жарыспалы тексеріс',
  department: '',
  academic_year: '2026–2027',
  semester: 1,
  description: '',
});
const token = await newInvite(admin, group, 1, 1);
const results = await Promise.allSettled(students.map((id) => acceptInvitation(id, token)));
assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
assert.equal(
  (results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason.code,
  'invite',
);
const winner = students[results.findIndex((result) => result.status === 'fulfilled')];
await acceptInvitation(winner, token);
assert.equal(
  (await one<{ n: number }>('SELECT uses n FROM group_invites WHERE group_id=?', group))!.n,
  1,
);
const key = `concurrency:${randomUUID()}`;
assert.equal(
  (await Promise.all([1, 2, 3].map(() => rateLimit(key, 1, 60000)))).filter(Boolean).length,
  1,
);
await assert.rejects(
  transaction(async () => {
    await run('INSERT INTO rate_limits VALUES(?,?,?)', 'rollback-probe', 1, 123);
    throw Error('rollback-probe');
  }),
  /rollback-probe/,
);
assert.equal(await one('SELECT * FROM rate_limits WHERE key=?', 'rollback-probe'), undefined);
const object = `materials/${randomUUID()}.pdf`,
  path = '.test-data/unused-storage-probe',
  bytes = Buffer.from('%PDF-private-storage-roundtrip');
try {
  await putStored(object, path, bytes, 'application/pdf');
  assert.deepEqual(await getStored(object, path), bytes);
  const endpoint = process.env.AWS_ENDPOINT_URL_S3!.replace(/\/$/, '');
  const anonymous = await fetch(`${endpoint}/bilimhub-files/${object}`);
  assert([401, 403].includes(anonymous.status), 'Private object is anonymously accessible.');
} finally {
  await deleteStored(object, path);
}
await assert.rejects(getStored(object, path));
console.log(
  'PASS: PostgreSQL serializable invite capacity, idempotency, concurrent rate limit, rollback; Neon private storage upload/read/delete and anonymous denial.',
);
