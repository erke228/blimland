import { randomBytes, randomUUID } from 'node:crypto';
import { migrate, one, run } from '../src/lib/db';
import { hashPassword } from '../src/lib/security';

const email = process.argv[2]?.trim().toLowerCase();
const name = process.argv[3] || 'Платформа әкімшісі';
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run admin:create -- email@example.kz "Name"');
  process.exit(1);
}
migrate();
if (one("SELECT id FROM users WHERE role = 'admin'")) {
  console.error('The super administrator already exists. A second owner cannot be created.');
  process.exit(1);
}
if (one('SELECT id FROM users WHERE email = ?', email)) {
  console.error('Account already exists. No roles or credentials changed.');
  process.exit(1);
}
const password = randomBytes(18).toString('base64url');
run(
  'INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  randomUUID(),
  email,
  name,
  hashPassword(password),
  'admin',
  Date.now(),
);
console.log(
  `Admin created: ${email}\nOne-time displayed initial password: ${password}\nStore securely. This output is not saved by the application.`,
);
