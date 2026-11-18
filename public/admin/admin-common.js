// public/admin/admin-common.js
// Общие утилиты для всех страниц админки.

export const CONFIG = { API_URL: '/api/volgodonsk' };

// Полное HTML-экранирование — безопасно и для текста, и для атрибутов.
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Обёртка над fetch: 401 → редирект на вход. Cookie отправляется автоматически.
export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const resp = await fetch(`${CONFIG.API_URL}${path}`, {
    ...options, headers, credentials: 'same-origin'
  });
  if (resp.status === 401) {
    localStorage.removeItem('volg_user');
    localStorage.removeItem('volg_token');
    window.location.href = '/volgodonsk/login.html';
    throw new Error('unauthorized');
  }
  return resp;
}

// Проверка is_admin по localStorage + редирект.
// Реальная защита — на сервере (403), это только UX.
export function requireAdmin() {
  try {
    const u = JSON.parse(localStorage.getItem('volg_user') || 'null');
    if (!u || !u.is_admin) throw new Error('not admin');
    return u;
  } catch {
    alert('Доступ запрещён. Требуется роль администратора.');
    window.location.href = '/volgodonsk/chat.html';
    throw new Error('not admin');
  }
}

// Выход: очищает cookie + localStorage.
export async function logoutAdmin() {
  try { await apiFetch('/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem('volg_user');
  localStorage.removeItem('volg_token');
  window.location.href = '/volgodonsk/login.html';
}

// Универсальный помощник «показать ошибку» в элементе.
export function showError(el, msg) {
  if (el) el.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`;
}