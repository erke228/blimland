import sharp from 'sharp';
import { ManagementError } from './management';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export async function imageWebp(bytes: Buffer, width: number, height: number) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ManagementError('coversize');
  const raster =
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
  if (!raster) throw new ManagementError('coverinvalid');
  try {
    const input = sharp(bytes, { limitInputPixels: 20000000, failOn: 'warning' });
    const meta = await input.metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format || '') || (meta.pages || 1) !== 1)
      throw new Error('format');
    return await input
      .rotate()
      .resize(width, height, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ManagementError('coverinvalid');
  }
}
