import { resolveApiUrl } from './runtime';

export function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(resolveApiUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}
