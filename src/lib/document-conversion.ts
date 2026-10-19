import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import sanitizeHtml from 'sanitize-html';
import { fromBuffer } from 'yauzl';
// Keep the worker dependency in Next.js standalone tracing.
import 'mammoth';
import { ManagementError } from './management';

export function safeDocumentHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'strong',
      'em',
      'u',
      's',
      'sup',
      'sub',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'br',
      'hr',
      'blockquote',
      'pre',
      'code',
      'a',
      'img',
    ],
    allowedAttributes: {
      a: ['href', 'id'],
      img: ['src', 'alt'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['https'],
    allowedSchemesByTag: { img: ['data'] },
    allowProtocolRelative: false,
    exclusiveFilter: (frame) =>
      frame.tag === 'img' &&
      !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(frame.attribs.src || ''),
  });
}
export async function validateDocxArchive(buffer: Buffer) {
  return new Promise<void>((resolveZip, reject) => {
    const invalid = () => reject(new ManagementError('documentinvalid'));
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return invalid();
      let entries = 0;
      let expanded = 0;
      const names = new Set<string>();
      zip.on('error', invalid);
      zip.on('entry', (entry) => {
        entries++;
        expanded += entry.uncompressedSize;
        if (
          entries > 1000 ||
          expanded > 40 * 1024 * 1024 ||
          entry.generalPurposeBitFlag & 1 ||
          /vbaProject\.bin$/i.test(entry.fileName) ||
          names.has(entry.fileName)
        ) {
          zip.close();
          return invalid();
        }
        names.add(entry.fileName);
        zip.readEntry();
      });
      zip.on('end', () =>
        names.has('[Content_Types].xml') && names.has('word/document.xml')
          ? resolveZip()
          : invalid(),
      );
      zip.readEntry();
    });
  });
}
export async function convertDocx(buffer: Buffer) {
  await validateDocxArchive(buffer);
  const worker = new Worker(
    /* turbopackIgnore: true */ resolve(/* turbopackIgnore: true */ 'scripts/convert-docx.cjs'),
    {
      workerData: buffer,
      resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 8 },
    },
  );
  try {
    const result = await new Promise<{ html: string; warning: boolean }>(
      (resolveWorker, reject) => {
        const timer = setTimeout(() => reject(new ManagementError('documentinvalid')), 10000);
        const fail = () => {
          clearTimeout(timer);
          reject(new ManagementError('documentinvalid'));
        };
        worker.once('error', (error) => {
          console.error('DOCX worker failed:', error.message);
          fail();
        });
        worker.once('exit', fail);
        worker.once('message', (result) => {
          clearTimeout(timer);
          if (
            result.error ||
            typeof result.html !== 'string' ||
            result.html.length > 40 * 1024 * 1024
          )
            fail();
          else resolveWorker(result);
        });
      },
    );
    return { html: safeDocumentHtml(result.html), warning: result.warning };
  } finally {
    await worker.terminate();
  }
}
