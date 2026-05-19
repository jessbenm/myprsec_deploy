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

export const askRAG = async (question: string, vps_id?: number) => {
  const res = await apiFetch('/api/rag/ask', {
    method: 'POST',
    body: JSON.stringify({ question, vps_id }),
  });
  return res.json();
};

export const detectVpsTools = async (vpsId: string) => {
  const res = await apiFetch(`/api/vps/${vpsId}/detect`, { method: 'POST' });
  return res.json();
};

export const getDetectedTools = async (vpsId: string) => {
  const res = await apiFetch(`/api/vps/${vpsId}/detected-tools`);
  return res.json();
};

export const getDetectedProjects = async (vpsId: string) => {
  const res = await apiFetch(`/api/vps/${vpsId}/detected-projects`);
  return res.json();
};
