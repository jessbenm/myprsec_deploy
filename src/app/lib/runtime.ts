const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const WS_BASE_URL = (import.meta.env.VITE_WS_URL || '').replace(/\/+$/, '');

function joinUrl(baseUrl: string, path: string) {
  if (!baseUrl) return path;
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function resolveApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return joinUrl(API_BASE_URL, path);
}

export function resolveAuthUrl(path: string) {
  return resolveApiUrl(path);
}

export function resolveWsUrl(path: string) {
  if (/^wss?:\/\//i.test(path)) return path;
  if (WS_BASE_URL) return joinUrl(WS_BASE_URL, path);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path.startsWith('/') ? '' : '/'}${path}`;
}