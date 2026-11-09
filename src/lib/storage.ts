import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { readExactVideoBytes, validateStoredVideoSize } from './bounded-storage-read';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { usesPostgres } from './db';
import { signDirectVideoPost } from './direct-video-policy';
import type { DirectVideoReservation } from './direct-video-uploads';

const bucket = 'bilimhub-files';
let client: S3Client | undefined;
export function usesObjectStorage() {
  return (
    process.env.STORAGE_DRIVER === 'neon' ||
    (process.env.STORAGE_DRIVER !== 'local' && usesPostgres())
  );
}
function s3() {
  if (
    !process.env.AWS_ENDPOINT_URL_S3 ||
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY
  )
    throw new Error('Private Neon Object Storage configuration is missing.');
  return (client ||= new S3Client({
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  }));
}
function checkedKey(key: string) {
  if (
    !/^(?:(materials|covers|avatars)\/[a-f0-9-]{36}\.(pdf|docx|webp)(\.html)?|videos\/[a-f0-9-]{36}\.mp4)$/.test(
      key,
    )
  )
    throw new Error('Invalid storage key.');
  return key;
}
export async function privateVideoUrl(key: string) {
  checkedKey(key);
  if (!/^videos\//.test(key)) throw new Error('A video key is required.');
  if (!usesObjectStorage()) return undefined;
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: 'video/mp4' }),
    { expiresIn: 300 },
  );
}
export async function privateVideoUploadPost(reservation: DirectVideoReservation) {
  if (!usesObjectStorage()) throw new Error('Direct upload requires private object storage.');
  return signDirectVideoPost(s3(), reservation);
}
export async function putStored(
  key: string,
  path: string,
  bytes: Buffer | string,
  contentType: string,
) {
  checkedKey(key);
  if (usesObjectStorage()) {
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: 'private, no-store',
      }),
    );
  } else {
    await mkdir(dirname(/* turbopackIgnore: true */ path), { recursive: true });
    await writeFile(/* turbopackIgnore: true */ path, bytes, { flag: 'wx' });
  }
}
export async function getStored(key: string, path: string): Promise<Buffer> {
  checkedKey(key);
  if (!usesObjectStorage()) return readFile(/* turbopackIgnore: true */ path);
  const object = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) throw new Error('Storage object is empty.');
  return Buffer.from(await object.Body.transformToByteArray());
}
// For untrusted staging uploads only; do not buffer an unchecked remote object.
export async function getReservedVideoBytes(
  key: string,
  path: string,
  expectedBytes: number,
  timeoutMs = 30000,
) {
  checkedKey(key);
  if (!key.startsWith('videos/')) throw new Error('A video key is required.');
  validateStoredVideoSize(expectedBytes);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw new Error('Invalid staging read timeout.');
  const controller = new AbortController();
  const timeoutError = new Error('Staging video read timed out.');
  let body: Readable | undefined;
  const stop = () => body?.destroy(timeoutError);
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  timer.unref();
  try {
    if (!usesObjectStorage()) body = createReadStream(/* turbopackIgnore: true */ path);
    else {
      const object = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: controller.signal,
      });
      if (!(object.Body instanceof Readable)) throw new Error('A Node storage stream is required.');
      body = object.Body;
      if (object.ContentLength !== undefined && object.ContentLength !== expectedBytes)
        throw new Error('Storage object size differs from reservation.');
    }
    controller.signal.throwIfAborted();
    // The SDK request may already have returned headers; still abort the response body.
    controller.signal.addEventListener('abort', stop, { once: true });
    return await readExactVideoBytes(body, expectedBytes);
  } catch (error) {
    if (controller.signal.aborted) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', stop);
    body?.destroy();
  }
}
export async function deleteStored(key: string, path: string) {
  checkedKey(key);
  if (usesObjectStorage()) await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  else
    await unlink(/* turbopackIgnore: true */ path).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
}
