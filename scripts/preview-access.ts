import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrate, one, run, transaction } from '../src/lib/db';
import { hashPassword } from '../src/lib/security';
// Explicit local setup command. Never invoked by the web server or deployment.
await migrate();
const file = resolve('.local/preview-access.txt');
const existing = await one<{
  email: string;
}>("SELECT email FROM users WHERE role = 'admin'");
if (existing) {
  console.log(
    existsSync(file)
      ? `The existing local access note is at ${file}. No account changed.`
      : 'A super administrator already exists. Use its credentials. No account changed.',
  );
  process.exit(0);
}
if (existsSync(file)) {
  console.error(
    'An old access note exists without a matching owner. No account was created. Use admin:create with your chosen email instead.',
  );
  process.exit(1);
}
const password = randomBytes(18).toString('base64url');
const email = 'owner@bilimhub.local';
await transaction(async () => {
  await run(
    'INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    randomUUID(),
    email,
    'Бас әкімші',
    hashPassword(password),
    'admin',
    Date.now(),
  );
});
mkdirSync(resolve('.local'), { recursive: true });
writeFileSync(
  file,
  `ЛОКАЛЬНЫЙ ДОСТУП ДЛЯ ПРОВЕРКИ\n\nАдрес: http://127.0.0.1:3000/login\nEmail: ${email}\nПароль: ${password}\n\nЭто локальный аккаунт главного администратора. Пароль сгенерирован случайно и не включён в Git. Файл не размещать на публичном сервере.\nПрофиль: /profile; управление сайтом: /admin.\n`,
  { encoding: 'utf8', flag: 'wx', mode: 0o600 },
);
console.log(`Local super administrator created. Credentials are only in ${file}`);
