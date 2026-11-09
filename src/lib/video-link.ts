// A syntax hint only: actual playback must be checked by the browser.
export function inspectVideoLink(value: string): 'empty' | 'invalid' | 'page' | 'candidate' {
  if (!value.trim()) return 'empty';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return 'invalid';
    const host = url.hostname.toLowerCase();
    if (
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      ((host === 'vimeo.com' || host === 'www.vimeo.com') && /^\/\d+\/?$/.test(url.pathname)) ||
      (host === 'player.vimeo.com' && url.pathname.startsWith('/video/'))
    )
      return 'page';
    return 'candidate';
  } catch {
    return 'invalid';
  }
}
