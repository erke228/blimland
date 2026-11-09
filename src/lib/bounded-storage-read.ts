import { MAX_DIRECT_VIDEO_BYTES } from './video-limits';

export function validateStoredVideoSize(expectedBytes: number) {
  if (
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes < 1 ||
    expectedBytes > MAX_DIRECT_VIDEO_BYTES
  )
    throw new Error('Invalid expected video size.');
}

// Read the actual stream: a declared Content-Length alone cannot establish its size.
export async function readExactVideoBytes(body: AsyncIterable<Uint8Array>, expectedBytes: number) {
  validateStoredVideoSize(expectedBytes);
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) throw new Error('Invalid storage response.');
    received += chunk.byteLength;
    if (received > expectedBytes) throw new Error('Storage object exceeds reserved size.');
    // Own the bytes even if the source reuses its backing buffer on the next iteration.
    chunks.push(Buffer.from(chunk));
  }
  if (received !== expectedBytes) throw new Error('Storage object size differs from reservation.');
  return Buffer.concat(chunks, received);
}
