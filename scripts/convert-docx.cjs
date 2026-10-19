// Isolated conversion: no network/file references from a document, bounded heap
// and a timeout enforced by the parent. No user supplied code is evaluated.
const { parentPort, workerData } = require('node:worker_threads');
const mammoth = require('mammoth');
mammoth
  .convertToHtml(
    { buffer: Buffer.from(workerData) },
    {
      externalFileAccess: false,
      includeEmbeddedStyleMap: false,
      convertImage: mammoth.images.imgElement(async (image) => {
        if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(image.contentType))
          return { src: '' };
        const bytes = await image.readAsBuffer();
        if (bytes.length > 5 * 1024 * 1024) return { src: '' };
        return { src: `data:${image.contentType};base64,${bytes.toString('base64')}` };
      }),
    },
  )
  .then((result) =>
    parentPort.postMessage({ html: result.value, warning: result.messages.length > 0 }),
  )
  .catch(() => parentPort.postMessage({ error: true }));
