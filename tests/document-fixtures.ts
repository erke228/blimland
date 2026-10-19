import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
export async function pdfFixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Private lecture test', { x: 50, y: 700, font });
  return Buffer.from(await pdf.save());
}
export async function docxFixture(unsafeLink = false) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>Ә Ғ Қ Ң Ө Ұ Ү Һ І — Word дәрісі</w:t></w:r></w:p><w:p><w:hyperlink r:id="bad"><w:r><w:t>Сілтеме</w:t></w:r></w:hyperlink></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Кесте</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="bad" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${unsafeLink ? 'javascript:alert(1)' : 'https://example.com'}" TargetMode="External"/></Relationships>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}
