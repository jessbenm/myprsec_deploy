const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(`${BACKEND_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}
