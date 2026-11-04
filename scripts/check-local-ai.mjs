// Standalone smoke check: synthetic material only, no database or app credentials.
const base = new URL(process.env.OLLAMA_URL || 'http://127.0.0.1:11434');
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
  base.protocol !== 'http:' ||
  base.username ||
  base.password
) {
  throw Error('This local smoke check accepts a loopback HTTP endpoint only.');
}
const model = process.env.OLLAMA_MODEL || 'qwen3:1.7b';
try {
  const tags = await fetch(new URL('/api/tags', base), { signal: AbortSignal.timeout(5000) });
  if (!tags.ok) throw Error(`Model inventory HTTP ${tags.status}`);
  const inventory = await tags.json();
  if (!inventory.models?.some((item) => item.name === model))
    throw Error(`Model ${model} is not downloaded.`);
  const response = await fetch(new URL('/api/chat', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      messages: [
        {
          role: 'system',
          content:
            'Қазақша жауап бер. Тек берілген мәтінге сүйен. Мәлімет жеткіліксіз болса, оны айт. /no_think',
        },
        {
          role: 'user',
          content:
            'Оқу мәтіні: E = n * P * t / 1000, бірлігі кВт·сағат. n=2 шам, P=10 Вт, t=5 сағат. E қанша? Жауапты бір сөйлеммен жаз.',
        },
      ],
      options: { temperature: 0, num_ctx: 2048, num_predict: 160 },
    }),
  });
  if (!response.ok) throw Error(`Inference HTTP ${response.status}`);
  const data = await response.json();
  const answer = data.message?.content?.trim();
  if (!data.done || !answer) throw Error('No complete answer returned.');
  if (!/0[.,]1(?!\d)/.test(answer) || !/кВт/.test(answer))
    throw Error('Arithmetic smoke check failed: inspect the model output locally.');
  console.log(JSON.stringify({ status: 'PASS', model, answer, output_tokens: data.eval_count }));
  console.log(
    'This proves one synthetic example only; Kazakh quality and source-grounding need separate evaluation.',
  );
} catch (error) {
  console.error('LOCAL_AI_NOT_VERIFIED:', error.message);
  process.exitCode = 2;
}
