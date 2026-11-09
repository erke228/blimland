import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { S3Client } from '@aws-sdk/client-s3';
import type { DirectVideoReservation } from './direct-video-uploads';
import { MAX_DIRECT_VIDEO_BYTES } from './video-limits';
import { ManagementError } from './management';

export async function signDirectVideoPost(client: S3Client, reservation: DirectVideoReservation) {
  const seconds = Math.min(300, Math.floor((reservation.expires_at - Date.now()) / 1000) - 1);
  if (reservation.state !== 'pending' || seconds < 1)
    throw new ManagementError('directuploadexpired');
  if (
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(reservation.id) ||
    reservation.storage_key !== `${reservation.id}.mp4` ||
    !Number.isSafeInteger(reservation.expected_bytes) ||
    reservation.expected_bytes < 1 ||
    reservation.expected_bytes > MAX_DIRECT_VIDEO_BYTES
  )
    throw new ManagementError('videoinvalid');
  const post = await createPresignedPost(client, {
    Bucket: 'bilimhub-files',
    Key: `videos/${reservation.storage_key}`,
    Expires: seconds,
    Fields: {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'private, no-store',
      'x-amz-meta-upload-id': reservation.id,
      success_action_status: '204',
    },
    Conditions: [['content-length-range', reservation.expected_bytes, reservation.expected_bytes]],
  });
  const policy = JSON.parse(Buffer.from(post.fields.Policy, 'base64').toString('utf8'));
  const expiresAt = Date.parse(policy.expiration);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > reservation.expires_at)
    throw new ManagementError('directuploadexpired');
  return { ...post, expiresAt };
}
