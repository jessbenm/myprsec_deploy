import { resolveAuthUrl } from './lib/runtime';

export const AUTH_API_URL = '/api/auth';

type AuthPayload = Record<string, unknown>;

async function request<T>(path: string, body?: AuthPayload, method?: string): Promise<T> {
  const resolvedMethod = method || (body !== undefined ? 'POST' : 'GET');
  const response = await fetch(resolveAuthUrl(`${AUTH_API_URL}${path}`), {
    method: resolvedMethod,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }

  return data as T;
}

interface FullUser {
  id: number; name: string; email: string;
  phone: string; location: string; timezone: string;
  created_at: number; updated_at: number;
}

export async function signupUser(payload: { name: string; email: string; password: string; confirmPassword: string; }) {
  return request<{ success: boolean; data: { user: FullUser } }>('/signup', payload);
}

export async function loginUser(payload: { email: string; password: string; }) {
  return request<{ success: boolean; data: { user: FullUser } }>('/login', payload);
}

export async function getCurrentUser() {
  return request<{ success: boolean; data: { user: FullUser } }>('/me');
}

export async function updateProfile(payload: { name: string; phone: string; location: string; timezone: string; }) {
  return request<{ success: boolean; data: { user: FullUser } }>('/me', payload as unknown as AuthPayload, 'PUT');
}

export async function changePassword(payload: { currentPassword: string; newPassword: string; }) {
  return request<{ success: boolean; message: string }>('/change-password', payload as unknown as AuthPayload);
}

export async function logoutUser() {
  return request<{ success: boolean }>('/logout', {} as AuthPayload);
}