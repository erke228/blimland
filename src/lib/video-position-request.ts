// A stalled request must release the player's serialized save queue so retry can run.
export async function sendVideoPosition(
  lessonId: string,
  position: number,
  request: typeof fetch = fetch,
  timeoutMs = 10000,
) {
  if (
    !/^[a-f0-9-]{36}$/.test(lessonId) ||
    !Number.isFinite(position) ||
    position < 0 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 10000
  )
    throw new Error('Invalid video position request.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const form = new FormData();
  form.set('position', String(position));
  try {
    const response = await request(`/learn/${lessonId}/video/progress`, {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      keepalive: true,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Position was not saved');
  } finally {
    clearTimeout(timer);
  }
}
