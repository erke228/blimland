import { cache } from 'react';
import { one } from '@/lib/db';
import { AvatarImage } from './avatar-image';
const presentation = cache(async (id: string) =>
  one<{ has_avatar: number; avatar_version: number }>(
    'SELECT (avatar_key IS NOT NULL) has_avatar,avatar_version FROM user_profiles WHERE user_id=?',
    id,
  ),
);
// Use only beside an already authorized identity (course author or basicProfile).
// The image route independently enforces current access on every request.
export async function UserAvatar({
  id,
  name,
  className = 'tiny-avatar',
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const row = await presentation(id);
  const src = row?.has_avatar ? `/api/avatars/${id}?v=${row.avatar_version}` : undefined;
  return (
    <AvatarImage
      key={`${id}:${row?.avatar_version || 0}`}
      src={src}
      name={name}
      className={className}
    />
  );
}
