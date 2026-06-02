// Centralized API utility for StayFitx

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('stayfitx_token');
}

export function setToken(token: string) {
  localStorage.setItem('stayfitx_token', token);
}

export function clearToken() {
  localStorage.removeItem('stayfitx_token');
  localStorage.removeItem('stayfitx_user');
}

export function getUser(): { role: string; name: string; email: string } | null {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem('stayfitx_user');
  return u ? JSON.parse(u) : null;
}

export function setUser(user: object) {
  localStorage.setItem('stayfitx_user', JSON.stringify(user));
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}/api/gym${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function login(email: string, password: string) {
  const form = new URLSearchParams();
  form.append('username', email);
  form.append('password', password);
  const res = await fetch(`${API}/api/gym/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(err.detail);
  }
  return res.json();
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminGetSchedule = (date: string) => apiFetch(`/admin/schedule?date_str=${date}`);
export const adminGetCapacity = (weekOf: string) => apiFetch(`/admin/capacity?week_of=${weekOf}`);
export const adminGetTrainers = () => apiFetch('/admin/trainers');
export const adminCreateTrainer = (body: object) => apiFetch('/admin/trainers', { method: 'POST', body: JSON.stringify(body) });
export const adminCancelSeries = (seriesId: string) => apiFetch(`/admin/series/${seriesId}`, { method: 'DELETE' });
export const adminGetSeries = () => apiFetch('/admin/series');
export const adminGetNotifications = () => apiFetch('/admin/notifications');
export const adminMarkRead = (id: string) => apiFetch(`/admin/notifications/${id}/read`, { method: 'PATCH' });
export const adminCancelSession = (id: string, reason: string) =>
  apiFetch(`/admin/sessions/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason }) });

// ── Trainer ───────────────────────────────────────────────────────────────────
export const trainerGetSchedule = (date: string) => apiFetch(`/trainer/schedule?date_str=${date}`);
export const trainerGetClients = () => apiFetch('/trainer/clients');
export const trainerAddClient = (body: object) => apiFetch('/trainer/clients', { method: 'POST', body: JSON.stringify(body) });
export const trainerBookSession = (body: object) => apiFetch('/trainer/sessions', { method: 'POST', body: JSON.stringify(body) });
export const trainerCancelSession = (id: string, reason: string) =>
  apiFetch(`/trainer/sessions/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason }) });
export const trainerRescheduleSession = (id: string, body: object) =>
  apiFetch(`/trainer/sessions/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify(body) });
