import { randomUUID } from 'node:crypto';
import { putStored, getStored, deleteStored } from './storage';
import { resolve } from 'node:path';
import { z } from 'zod';
import { actor, ManagementError, recordAudit, updateOwnProfile } from './management';
import { one, run, transaction } from './db';
import { hashPassword, verifyPassword, rateLimit } from './security';
import { imageWebp } from './images';
export type ProfileDetails = {
  university: string;
  bio: string;
  phone: string;
  city: string;
  website: string;
  avatar_version: number;
  has_avatar: number;
};
export async function ownProfile(id: string): Promise<ProfileDetails> {
  await actor(id);
  return {
    ...((await one<ProfileDetails>(
      'SELECT university,bio,phone,city,website,avatar_version,(avatar_key IS NOT NULL) has_avatar FROM user_profiles WHERE user_id=?',
      id,
    )) || {
      university: '',
      bio: '',
      phone: '',
      city: '',
      website: '',
      avatar_version: 0,
      has_avatar: 0,
    }),
  };
}
export async function saveExtendedProfile(id: string, input: unknown) {
  await actor(id);
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      department: z.string().trim().max(180),
      academic_title: z.string().trim().max(120),
      university: z.string().trim().max(180).default(''),
      bio: z.string().trim().max(3000).default(''),
      phone: z.string().trim().max(40).default(''),
      city: z.string().trim().max(120).default(''),
      website: z.string().trim().max(500).default(''),
    })
    .safeParse(input);
  if (!parsed.success) throw new ManagementError('userform');
  const d = parsed.data;
  if (d.website) {
    try {
      const url = new URL(d.website);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
        throw new Error();
    } catch {
      throw new ManagementError('profilewebsite');
    }
  }
  await transaction(async () => {
    await updateOwnProfile(id, d);
    await run(
      `INSERT INTO user_profiles(user_id,university,bio,phone,city,website) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET university=excluded.university,bio=excluded.bio,phone=excluded.phone,city=excluded.city,website=excluded.website`,
      id,
      d.university,
      d.bio,
      d.phone,
      d.city,
      d.website,
    );
  });
}
async function credentialUser(id: string, password: string) {
  await actor(id);
  if (!(await rateLimit(`profile-credentials:${id}`, 10, 900000)))
    throw new ManagementError('rate');
  const user = (await one<{
    password_hash: string;
  }>('SELECT password_hash FROM users WHERE id=?', id))!;
  if (password.length > 128 || !verifyPassword(password, user.password_hash))
    throw new ManagementError('currentpassword');
  return user;
}
export async function changeOwnPassword(
  id: string,
  current: string,
  next: string,
  confirmation: string,
) {
  const user = await credentialUser(id, current);
  if (next.length < 12 || next.length > 128 || next !== confirmation || next === current)
    throw new ManagementError('newpassword');
  const hash = hashPassword(next);
  await transaction(async () => {
    if (
      !(
        await run(
          'UPDATE users SET password_hash=?,updated_at=? WHERE id=? AND password_hash=?',
          hash,
          Date.now(),
          id,
          user.password_hash,
        )
      ).changes
    )
      throw new ManagementError('currentpassword');
    await run('DELETE FROM sessions WHERE user_id=?', id);
    await recordAudit(id, 'profile.password.changed', id);
  });
}
export async function changeOwnEmail(id: string, current: string, email: string) {
  await credentialUser(id, current);
  const value = email.trim().toLowerCase();
  if (!z.email().max(254).safeParse(value).success) throw new ManagementError('userform');
  if (await one('SELECT id FROM users WHERE email=? AND id!=?', value, id))
    throw new ManagementError('email');
  await transaction(async () => {
    await run('UPDATE users SET email=?,updated_at=? WHERE id=?', value, Date.now(), id);
    await run('DELETE FROM sessions WHERE user_id=?', id);
    await recordAudit(id, 'profile.email.changed', id);
  });
}
function avatarPath(key: string) {
  if (!/^[a-f0-9-]{36}\.webp$/.test(key)) throw new ManagementError('coverinvalid');
  return resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || './uploads', 'avatars', key);
}
export async function uploadAvatar(id: string, bytes: Buffer) {
  await actor(id);
  const output = await imageWebp(bytes, 512, 512);
  await actor(id);
  const old = (
    await one<{
      avatar_key: string;
    }>('SELECT avatar_key FROM user_profiles WHERE user_id=?', id)
  )?.avatar_key;
  const key = `${randomUUID()}.webp`,
    path = avatarPath(key);
  await putStored(`avatars/${key}`, path, output, 'image/webp');
  try {
    await actor(id);
    await run(
      `INSERT INTO user_profiles(user_id,avatar_key,avatar_version) VALUES (?,?,1) ON CONFLICT(user_id) DO UPDATE SET avatar_key=excluded.avatar_key,avatar_version=user_profiles.avatar_version+1`,
      id,
      key,
    );
    await recordAudit(id, 'profile.avatar.updated', id);
  } catch (error) {
    await deleteStored(`avatars/${key}`, path).catch(() => {});
    throw error;
  }
  if (old) await deleteStored(`avatars/${old}`, avatarPath(old)).catch(() => {});
}
export async function readOwnAvatar(id: string) {
  await actor(id);
  const key = (
    await one<{
      avatar_key: string;
    }>('SELECT avatar_key FROM user_profiles WHERE user_id=?', id)
  )?.avatar_key;
  if (!key) return undefined;
  try {
    return await getStored(`avatars/${key}`, avatarPath(key));
  } catch {
    return undefined;
  }
}
