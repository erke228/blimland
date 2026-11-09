import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { inspectVideoLink } from '../src/lib/video-link';
import { LectureVideoField } from '../src/components/lecture-video-field';

test('video link hints distinguish unsafe input, viewing pages and signed file links', () => {
  for (const url of [
    'javascript:alert(1)',
    'http://video.invalid/a.mp4',
    'https://a:b@video.invalid/a.mp4',
    'broken',
  ])
    assert.equal(inspectVideoLink(url), 'invalid');
  for (const url of [
    'https://www.youtube.com/watch?v=123',
    'https://youtu.be/123',
    'https://vimeo.com/123',
    'https://player.vimeo.com/video/123',
  ])
    assert.equal(inspectVideoLink(url), 'page');
  for (const url of [
    'https://cdn.invalid/a.mp4?token=example',
    'https://cdn.invalid/signed/123',
    'https://player.vimeo.com/external/123.mp4',
  ])
    assert.equal(inspectVideoLink(url), 'candidate');
  assert.equal(inspectVideoLink('  '), 'empty');
});
test('teacher preview never autoloads media and preserves an existing stored video URL field', () => {
  const html = renderToStaticMarkup(
    createElement(LectureVideoField, {
      initial: 'https://cdn.invalid/legacy.mp4',
      storedSrc: '/learn/fixture/video',
    }),
  );
  assert(html.includes('Жүктелген бейнесабақ') && html.includes('Бейнені алдын ала көру'));
  assert(html.includes('type="hidden" name="videoUrl" value="https://cdn.invalid/legacy.mp4"'));
  assert(!html.includes('<video') && !html.includes('type="url"'));
  const page = renderToStaticMarkup(
    createElement(LectureVideoField, { initial: 'https://youtu.be/123' }),
  );
  assert(page.includes('Бұл — бейнені көру беті') && page.includes('disabled=""'));
  assert(!page.includes('<video'));
});
test('video upload stays out of the lecture save form and is offered only after lesson creation', () => {
  const saved = renderToStaticMarkup(createElement(LectureVideoField, { lessonId: 'fixture' }));
  assert(saved.includes('Қысқа MP4 бейнесін қосу') && saved.includes('90 секунд'));
  const picker = saved.match(/<input\b[^>]*>/g)?.find((input) => input.includes('type="file"'));
  assert(picker?.includes('name=""'));
  assert(!saved.includes('<form') && !saved.includes('type="submit"'));
  const fresh = renderToStaticMarkup(createElement(LectureVideoField, {}));
  assert(!fresh.includes('type="file"') && fresh.includes('алдымен дәрісті сақтаңыз'));
});
test('stored video replacement begins collapsed and needs an owner version receipt', () => {
  const ready = renderToStaticMarkup(
    createElement(LectureVideoField, {
      lessonId: 'fixture',
      storedSrc: '/learn/fixture/video',
      storedSha256: 'a'.repeat(64),
    }),
  );
  assert(ready.includes('Бейнені ауыстыру'));
  assert(!ready.includes('type="file"') && !ready.includes('type="checkbox"'));
  assert(!ready.includes('<form') && !ready.includes('type="submit"'));
  const legacy = renderToStaticMarkup(
    createElement(LectureVideoField, { lessonId: 'fixture', storedSrc: '/learn/fixture/video' }),
  );
  assert(!legacy.includes('>Бейнені ауыстыру<'));
});
