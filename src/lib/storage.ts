import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { usesPostgres } from './db';

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
  if (!/^(materials|covers|avatars)\/[a-f0-9-]{36}\.(pdf|docx|webp)(\.html)?$/.test(key))
    throw new Error('Invalid storage key.');
  return key;
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
export async function deleteStored(key: string, path: string) {
  checkedKey(key);
  if (usesObjectStorage()) await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  else
    await unlink(/* turbopackIgnore: true */ path).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
}
