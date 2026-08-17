export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'opal_line_session_token';

export type ApiUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  roles?: { id: string; name: string }[];
  permissions: string[];
};

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Request failed');
  return body.data as T;
}

export async function login(identity: string, password: string) {
  const response = await fetch(`${API_URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity, password }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Unable to sign in');
  localStorage.setItem(TOKEN_KEY, body.data.token);
  return api<ApiUser>('/api/auth/me');
}

export async function logout() {
  try { if (getToken()) await api('/api/auth/logout', { method: 'POST' }); } finally { clearToken(); }
}
