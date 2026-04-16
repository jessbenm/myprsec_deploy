const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
export const AUTH_API_URL = `${BACKEND_URL}/api/auth`;

type AuthPayload = Record<string, unknown>;

async function request<T>(path: string, body?: AuthPayload): Promise<T> {
  const response = await fetch(`${AUTH_API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }

  return data as T;
}

export async function signupUser(payload: { name: string; email: string; password: string; confirmPassword: string; }) {
  return request<{ success: boolean; data: { user: { id: number; name: string; email: string } } }>('/signup', payload);
}

export async function loginUser(payload: { email: string; password: string; }) {
  return request<{ success: boolean; data: { user: { id: number; name: string; email: string } } }>('/login', payload);
}

export async function getCurrentUser() {
  return request<{ success: boolean; data: { user: { id: number; name: string; email: string; created_at: number; updated_at: number } } }>('/me');
}

export async function logoutUser() {
  return request<{ success: boolean }>('/logout', {} as AuthPayload);
}