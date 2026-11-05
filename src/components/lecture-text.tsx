import { lectureBlocks } from '@/lib/lecture-text';
export function LectureText({ text }: { text: string }) {
  return (
    <>
      {lectureBlocks(text).map((block, i) => {
        if (block.kind === 'heading')
          return block.level === 1 ? (
            <h2 key={i}>{block.text}</h2>
          ) : block.level === 2 ? (
            <h3 key={i}>{block.text}</h3>
          ) : (
            <h4 key={i}>{block.text}</h4>
          );
        if (block.kind === 'list')
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        if (block.kind === 'code')
          return (
            <figure className="lecture-code" key={i}>
              {block.language && <figcaption>{block.language}</figcaption>}
              <pre>
                <code>{block.text}</code>
              </pre>
            </figure>
          );
        return (
          <p key={i} style={{ whiteSpace: 'pre-wrap' }}>
            {block.text}
          </p>
        );
      })}
    </>
  );
}
