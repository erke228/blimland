export type LectureBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; language: string; text: string }
  | { kind: 'list'; items: string[] };
// Deliberately small text format: no HTML, executable embeds, or remote resources.
export function lectureBlocks(source: string): LectureBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n'),
    blocks: LectureBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }
    const fence = lines[i].match(/^```([a-zA-Z0-9_+-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push({ kind: 'code', language: fence[1], text: code.join('\n') });
      continue;
    }
    const heading = lines[i].match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (/^[-*] /.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(lines[i++].slice(2));
      blocks.push({ kind: 'list', items });
      continue;
    }
    const paragraph: string[] = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !/^(?:```|#{1,3}\s|[-*] )/.test(lines[i]))
      paragraph.push(lines[i++]);
    blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
  }
  return blocks;
}
