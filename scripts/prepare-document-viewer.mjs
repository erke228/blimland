import { readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
function copyDirectory(source, target) {
  mkdirSync(target, { recursive: true });
  for (const item of readdirSync(source, { withFileTypes: true })) {
    if (item.isDirectory()) copyDirectory(join(source, item.name), join(target, item.name));
    else if (item.isFile()) copyFileSync(join(source, item.name), join(target, item.name));
  }
}
const output = 'public/document-runtime';
mkdirSync(output, { recursive: true });
copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', `${output}/pdf.worker.min.mjs`);
copyFileSync('node_modules/pdfjs-dist/LICENSE', `${output}/LICENSE`);
for (const directory of ['cmaps', 'standard_fonts', 'wasm'])
  copyDirectory(`node_modules/pdfjs-dist/${directory}`, `${output}/${directory}`);
