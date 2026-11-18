// public/chat_js/auth.js
import { CONFIG } from './config.js';

export function getToken() { return localStorage.getItem(CONFIG.TOKEN_KEY); }
export function setToken(t) { localStorage.setItem(CONFIG.TOKEN_KEY, t); }

export function getCurrentUser() {
    const userStr = localStorage.getItem(CONFIG.USER_KEY);
    if (!userStr) {
        window.location.href = '/volgodonsk/login.html';
        return null;
    }
    try { return JSON.parse(userStr); }
    catch { window.location.href = '/volgodonsk/login.html'; return null; }
}

export async function logout() {
    try { await apiFetch('/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem(CONFIG.USER_KEY);
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    window.location.href = '/volgodonsk/login.html';
}

// Универсальный fetch: 401 → редирект на логин.
// Cookie (httpOnly) отправляется автоматически, Bearer — как fallback.
export async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = getToken();
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    const resp = await fetch(`${CONFIG.API_URL}${path}`, {
        ...options, headers, credentials: 'same-origin'
    });
    if (resp.status === 401) {
        localStorage.removeItem(CONFIG.USER_KEY);
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        window.location.href = '/volgodonsk/login.html';
        throw new Error('unauthorized');
    }
    return resp;
}