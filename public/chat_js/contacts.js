// public/chat_js/contacts.js
import { apiFetch } from './auth.js';

let contactsData = [];
let unreadCounts = {};

function escapeHtml(t) {
    return String(t ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function loadContacts(currentUserId, onSelectChat) {
    const listEl = document.getElementById('contact-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="loading-contacts" style="padding:15px; color:#888;">Загрузка...</div>';

    try {
        const resp = await apiFetch('/users');
        const data = await resp.json();
        listEl.innerHTML = '';

        // Общий чат
        const generalChat = document.createElement('div');
        generalChat.className = 'contact-item active';
        generalChat.dataset.type = 'general';
        generalChat.dataset.id = '';
        generalChat.innerHTML = `
            <div class="contact-avatar" style="background:#3390ec;">📢</div>
            <div class="contact-info">
                <div class="contact-name">Общий чат</div>
                <div class="contact-status">Все участники проекта</div>
            </div>
        `;
        generalChat.addEventListener('click', () => {
            setActiveContact(generalChat);
            onSelectChat('general', null, 'Общий чат');
        });
        listEl.appendChild(generalChat);

        if (data.success && Array.isArray(data.users) && data.users.length > 0) {
            contactsData = data.users;
            data.users.forEach(user => listEl.appendChild(createContactElement(user, onSelectChat)));
        } else {
            listEl.innerHTML += '<div style="padding:15px; color:#888;">Нет других пользователей</div>';
        }

        await loadUnreadCounts();
    } catch (e) {
        console.error(e);
        if (listEl) listEl.innerHTML = '<div style="padding:15px; color:red;">Ошибка загрузки</div>';
    }
}

function createContactElement(user, onSelectChat) {
    const el = document.createElement('div');
    el.className = 'contact-item';
    el.dataset.type = 'private';
    el.dataset.id = user.id;

    const displayName = user.full_name || user.login || '';
    const initials = displayName.substring(0, 2).toUpperCase();

    el.innerHTML = `
        <div class="contact-avatar" style="background:#8e44ad;">${escapeHtml(initials)}</div>
        <div class="contact-info">
            <div class="contact-name">${escapeHtml(displayName)}</div>
            <div class="contact-status">Не в сети</div>
        </div>
        <div class="unread-badge" style="display:none;">0</div>
    `;
    el.addEventListener('click', () => {
        setActiveContact(el);
        onSelectChat('private', user.id, displayName);
    });
    return el;
}

async function loadUnreadCounts() {
    try {
        const resp = await apiFetch('/chat/unread-counts');
        const data = await resp.json();
        if (data.success) {
            unreadCounts = data.counts || {};
            renderUnreadBadges();
        }
    } catch (e) {
        console.error('unread:', e);
    }
}

export function setUnreadCounts(counts) {
    unreadCounts = { ...unreadCounts, ...counts };
    renderUnreadBadges();
}

export function clearUnreadCount(userId) {
    delete unreadCounts[String(userId)];
    renderUnreadBadges();
}

// Принудительно перезагрузить счётчики с сервера (после получения нового сообщения)
export async function refreshUnreadCounts() {
    await loadUnreadCounts();
}

function renderUnreadBadges() {
    document.querySelectorAll('.contact-item[data-type="private"]').forEach(el => {
        const userId = String(el.dataset.id);
        const badge = el.querySelector('.unread-badge');
        if (!badge) return;
        const count = unreadCounts[userId] || 0;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    });
}

export function updateOnlineStatus(onlineUserIds) {
    const ids = onlineUserIds.map(String);
    document.querySelectorAll('.contact-item[data-type="private"]').forEach(el => {
        const userId = el.dataset.id;
        const statusEl = el.querySelector('.contact-status');
        const avatarEl = el.querySelector('.contact-avatar');
        if (!statusEl || !avatarEl) return;
        if (ids.includes(String(userId))) {
            statusEl.textContent = 'Онлайн';
            avatarEl.classList.add('online');
        } else {
            statusEl.textContent = 'Не в сети';
            avatarEl.classList.remove('online');
        }
    });
}

function setActiveContact(activeEl) {
    document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
    activeEl.classList.add('active');
}