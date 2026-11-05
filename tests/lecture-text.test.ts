import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { lectureBlocks } from '../src/lib/lecture-text';
import { LectureText } from '../src/components/lecture-text';
test('Mixed lecture blocks preserve ordering, Kazakh and Python indentation', () => {
  const blocks = lectureBlocks(
    '# Әдіс\r\n\r\nТүсіндірме\r\n\r\n- Өлшеу\r\n- Салыстыру\r\n\r\n```python\r\nfor x in [1, 2]:\r\n    print(x)\r\n```\r\n\r\nҚорытынды',
  );
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ['heading', 'paragraph', 'list', 'code', 'paragraph'],
  );
  assert.deepEqual(blocks[3], {
    kind: 'code',
    language: 'python',
    text: 'for x in [1, 2]:\n    print(x)',
  });
});
test('Unfinished code fence remains readable and legacy plain text remains intact', () => {
  assert.deepEqual(lectureBlocks('Мәтін\nжалғасы\n\nЕкінші абзац'), [
    { kind: 'paragraph', text: 'Мәтін\nжалғасы' },
    { kind: 'paragraph', text: 'Екінші абзац' },
  ]);
  assert.deepEqual(lectureBlocks('```python\nprint(1)'), [
    { kind: 'code', language: 'python', text: 'print(1)' },
  ]);
  assert.equal(lectureBlocks('').length, 0);
});
test('Rendered lecture treats raw HTML and executable examples as text, not DOM', () => {
  const html = renderToStaticMarkup(
    createElement(LectureText, {
      text: '# <script>alert(1)</script>\n\n<img src="https://evil.invalid" onerror="alert(1)">\n\n```html\n<iframe src="javascript:alert(1)"></iframe>\n```',
    }),
  );
  assert(!/<script|<img|<iframe/.test(html));
  assert(html.includes('&lt;script&gt;') && html.includes('&lt;iframe'));
  assert(html.includes('<h2>') && html.includes('<pre><code>'));
});
