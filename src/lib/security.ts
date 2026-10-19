import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { one, run } from './db';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false;
  const [salt, encoded] = stored.split(':');
  if (!salt || !encoded || encoded.length !== 128) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(encoded, 'hex'));
}
export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export function issueSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  run('INSERT INTO sessions VALUES (?, ?, ?)', tokenHash(token), userId, Date.now() + 7 * 86400000);
  return token;
}
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const current = one<{ count: number; reset_at: number }>(
    'SELECT * FROM rate_limits WHERE key = ?',
    key,
  );
  if (!current || current.reset_at <= now) {
    run('INSERT OR REPLACE INTO rate_limits VALUES (?, 1, ?)', key, now + windowMs);
    return true;
  }
  if (current.count >= max) return false;
  run('UPDATE rate_limits SET count = count + 1 WHERE key = ?', key);
  return true;
}
export function safeVideoUrl(input: string) {
  if (!input.trim()) return '';
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
