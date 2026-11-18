// public/chat_js/main.js
import { validateMessage } from './validator.js';
import { getCurrentUser, logout, apiFetch } from './auth.js';
import { initSocket } from './socket.js';
import { appendMessage, removeMessageFromDOM, scrollToBottom, clearMessages, markMessageAsAdminDeleted } from './ui.js';
import { canSend } from './messages.js';
import { handleImageSelect, clearImagePreview } from './media.js';
import { playNotificationSound, startTitleBlinking, stopTitleBlinking, initAudioOnUserGesture } from './notifications.js';
import { loadContacts, updateOnlineStatus, setUnreadCounts, clearUnreadCount, refreshUnreadCounts } from './contacts.js';
import { loadSettings, saveSettings, applySettings, clearCurrentChatLocally } from './settings.js';

const user = getCurrentUser();
if (!user) throw new Error('Не авторизован');

function escapeHtml(t) {
    return String(t ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const socket = initSocket();
let onlineUserIds = [];
let selectedImageFile = null;
let currentChat = { type: 'general', userId: null, userName: 'Общий чат' };

const settings = loadSettings();
applySettings(settings);

// === DOM (все с null-guard'ами) ===
const $ = (id) => document.getElementById(id);
const messageForm = $('message-form');
const messageInput = $('message-input');
const imageInput = $('image-input');
const imagePreview = $('image-preview');
const sendBtn = $('send-btn');
const chatTitle = $('chat-title');
const sidebar = $('sidebar');
const btnBackMobile = $('btn-back-mobile');
const chatMessages = $('chat-messages');
const infoBanner = $('chat-info-banner');
const infoBannerText = $('chat-info-text');
const infoBannerClose = $('info-banner-close');
const settingsMenu = $('settings-menu');
const btnSettings = $('btn-settings');

// === ВЫХОД ===
const btnLogout = $('btn-logout');
if (btnLogout) btnLogout.addEventListener('click', logout);

if (btnBackMobile && sidebar) {
    btnBackMobile.addEventListener('click', () => sidebar.classList.remove('hidden'));
}

// === МЕНЮ НАСТРОЕК ===
if (btnSettings && settingsMenu) {
    btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
        if (!settingsMenu.contains(e.target) && e.target !== btnSettings) {
            settingsMenu.classList.add('hidden');
        }
    });
}

const settingSound = $('setting-sound');
if (settingSound) settingSound.addEventListener('change', (e) => {
    settings.sound = e.target.checked;
    saveSettings(settings);
});

const settingBlink = $('setting-blink');
if (settingBlink) settingBlink.addEventListener('change', (e) => {
    settings.blink = e.target.checked;
    saveSettings(settings);
    if (!settings.blink) stopTitleBlinking();
});

const settingFontsize = $('setting-fontsize');
if (settingFontsize) settingFontsize.addEventListener('change', (e) => {
    settings.fontSize = e.target.value;
    saveSettings(settings);
});

const settingPhone = $('setting-phone');
if (settingPhone) settingPhone.addEventListener('change', async (e) => {
    settings.showPhone = e.target.checked;
    saveSettings(settings);
    try {
        await apiFetch('/user/settings', {
            method: 'POST',
            body: JSON.stringify({ showPhone: settings.showPhone })
        });
    } catch (err) { console.error(err); }
});

const btnClearChat = $('btn-clear-chat');
if (btnClearChat && settingsMenu) btnClearChat.addEventListener('click', () => {
    if (confirm('Очистить историю этого чата только у вас?')) {
        clearCurrentChatLocally();
        settingsMenu.classList.add('hidden');
    }
});

if (user.is_admin) {
    const adminBtn = $('btn-admin');
    if (adminBtn) {
        adminBtn.style.display = 'flex';
        adminBtn.addEventListener('click', () => {
            window.location.href = '/volgodonsk/admin/index.html';
        });
    }
}

// === ИНФО-БАННЕР ===
async function loadInfoBanner(chatType, privateUserId) {
    if (!infoBanner || !infoBannerText) return;
    const storageKey = chatType === 'private' && privateUserId
        ? `info_banner_private_${privateUserId}` : 'info_banner_general';
    if (sessionStorage.getItem(storageKey) === 'hidden') {
        infoBanner.classList.add('hidden');
        return;
    }
    try {
        const resp = await apiFetch(`/chat/info?type=${chatType}`);
        const data = await resp.json();
        if (data.success && data.message && data.message.trim()) {
            infoBannerText.textContent = data.message;
            infoBanner.classList.remove('hidden');
            infoBanner.dataset.storageKey = storageKey;
        } else {
            infoBanner.classList.add('hidden');
        }
    } catch (e) { console.error(e); infoBanner.classList.add('hidden'); }
}

if (infoBannerClose) infoBannerClose.addEventListener('click', () => {
    const key = infoBanner.dataset.storageKey;
    if (key) sessionStorage.setItem(key, 'hidden');
    infoBanner.classList.add('hidden');
});

// === ЗАГОЛОВОК ===
function updateChatHeader() {
    const statusEl = $('online-status');
    if (currentChat.type === 'general') {
        if (chatTitle) chatTitle.innerHTML = `<span>Общий чат</span>`;
        if (statusEl) statusEl.textContent = `🟢 В сети: ${onlineUserIds.length}`;
    } else {
        const isOnline = onlineUserIds.map(String).includes(String(currentChat.userId));
        if (chatTitle) chatTitle.innerHTML = `<span>${escapeHtml(currentChat.userName)}</span>`;
        if (statusEl) statusEl.textContent = isOnline ? '🟢 Онлайн' : '⚫ Не в сети';
    }
}

// === ОТКРЫТИЕ ДИАЛОГА ===
async function handleChatSelect(type, userId, userName) {
    currentChat = { type, userId, userName };
    if (window.innerWidth <= 768 && sidebar) sidebar.classList.add('hidden');
    if (chatMessages) {
        clearMessages();
        chatMessages.innerHTML = '<div class="system-message">Загрузка истории...</div>';
    }
    updateChatHeader();
    loadInfoBanner(type, userId);

    if (type === 'private' && userId) {
        clearUnreadCount(userId);
        try {
            await apiFetch('/chat/mark-read', { method: 'POST', body: JSON.stringify({ senderId: userId }) });
        } catch (e) { console.error(e); }
    }

    try {
        const url = type === 'general' ? '/chat/history' : `/chat/private/${userId}`;
        const resp = await apiFetch(url);
        const data = await resp.json();
        if (data.success && Array.isArray(data.messages)) {
            clearMessages();
            data.messages.forEach(m => appendMessage(m, String(m.user_id) === String(user.id), user.is_admin));
            scrollToBottom();
        }
    } catch (e) { console.error('history:', e); }
}

loadContacts(user.id, handleChatSelect);
handleChatSelect('general', null, 'Общий чат');

// === ЗАМЕТКА ОТ АДМИНА ===
async function loadUserNote() {
    const noteEl = $('user-admin-note');
    if (!noteEl) return;
    try {
        const resp = await apiFetch('/user/note');
        const data = await resp.json();
        if (data.success && data.note && data.note.trim()) {
            noteEl.textContent = '📢 ' + data.note;
            noteEl.classList.remove('hidden');
        } else {
            noteEl.classList.add('hidden');
        }
    } catch (e) { console.error(e); }
}
window.loadUserNote = loadUserNote;
loadUserNote();

// === МЕДИА ===
if (imageInput && imagePreview) {
    imageInput.addEventListener('change', (e) => {
        selectedImageFile = handleImageSelect(e.target.files[0], (dataUrl) => {
            imagePreview.innerHTML = `<img src="${dataUrl}">`;
            imagePreview.classList.remove('hidden');
        });
    });
}

// === КЛИКИ В ЧАТЕ ===
if (chatMessages) {
    chatMessages.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            if (!confirm('Удалить сообщение?')) return;
            try {
                const r = await apiFetch(`/chat/message/${deleteBtn.dataset.id}`, { method: 'DELETE' });
                if (!r.ok) { const d = await r.json().catch(()=>({})); alert(d.error || 'Ошибка'); }
            } catch { alert('Ошибка соединения'); }
            return;
        }

        const reportBtn = e.target.closest('.report-btn');
        if (reportBtn) {
            const messageId = reportBtn.dataset.id;
            const reason = prompt('Причина жалобы (спам, оскорбление, флуд):');
            if (!reason) return;
            const comment = prompt('Комментарий (необязательно):') || '';
            try {
                const r = await apiFetch('/chat/report', {
                    method: 'POST',
                    body: JSON.stringify({ messageId, reason, comment })
                });
                const d = await r.json();
                if (r.ok) alert('✅ Жалоба отправлена.');
                else alert(d.error || 'Ошибка');
            } catch { alert('Ошибка соединения'); }
        }
    });
}

// === ТАЙМЕР АНТИСПАМА ===
let spamCooldownInterval = null;
function startSpamCooldown(seconds) {
    if (!sendBtn || !messageInput) return;
    let remaining = seconds;
    if (spamCooldownInterval) clearInterval(spamCooldownInterval);
    sendBtn.disabled = true; sendBtn.textContent = '⏳';
    messageInput.disabled = true;
    messageInput.placeholder = `⏳ Подождите ${remaining}с...`;
    spamCooldownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(spamCooldownInterval); spamCooldownInterval = null;
            sendBtn.disabled = false; sendBtn.textContent = '➤';
            messageInput.disabled = false; messageInput.placeholder = 'Введите сообщение...';
            messageInput.focus();
        } else {
            messageInput.placeholder = `⏳ Подождите ${remaining}с...`;
        }
    }, 1000);
}

// === ОТПРАВКА ===
if (messageForm) {
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (!text && !selectedImageFile) return;

        const validation = validateMessage(text);
        if (!validation.isValid) { alert(`⚠️ Сообщение не отправлено:\n${validation.reason}`); return; }
        if (!canSend()) { alert('⏳ Не спамьте!'); return; }

        const formData = new FormData();
        formData.append('text', text);
        if (currentChat.type === 'private' && currentChat.userId) {
            formData.append('receiverId', currentChat.userId);
        }
        if (selectedImageFile) formData.append('image', selectedImageFile);

        sendBtn.disabled = true; sendBtn.textContent = '…';

        try {
            const response = await apiFetch('/chat/send', { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 429 && data.remainingSeconds) startSpamCooldown(data.remainingSeconds);
                else { alert(data.error || 'Ошибка отправки'); sendBtn.disabled = false; sendBtn.textContent = '➤'; }
                return;
            }
            messageInput.value = '';
            clearImagePreview();
            selectedImageFile = null;
            stopTitleBlinking();
            sendBtn.disabled = false; sendBtn.textContent = '➤';
        } catch (err) {
            alert('Ошибка соединения: ' + err.message);
            sendBtn.disabled = false; sendBtn.textContent = '➤';
        }
    });
}

// === SOCKET.IO ===
socket.on('new_message', (msg) => {
    const isPrivateRelevant = msg.type === 'private' &&
        (String(msg.user_id) === String(user.id) || String(msg.user_id) === String(currentChat.userId));
    const s = loadSettings();

    if (currentChat.type === 'general' && msg.type === 'general') {
        appendMessage(msg, String(msg.user_id) === String(user.id), user.is_admin);
        if (String(msg.user_id) !== String(user.id) && document.hidden) {
            if (s.sound) playNotificationSound();
            if (s.blink) startTitleBlinking();
        }
    } else if (currentChat.type === 'private' && isPrivateRelevant) {
        appendMessage(msg, String(msg.user_id) === String(user.id), user.is_admin);
        if (String(msg.user_id) !== String(user.id)) {
            apiFetch('/chat/mark-read', { method: 'POST', body: JSON.stringify({ senderId: msg.user_id }) }).catch(() => {});
        }
        if (String(msg.user_id) !== String(user.id) && document.hidden) {
            if (s.sound) playNotificationSound();
            if (s.blink) startTitleBlinking();
        }
    } else if (msg.type === 'private' && String(msg.user_id) !== String(user.id)) {
        // Новое сообщение от кого-то, с кем сейчас НЕ открыт диалог — обновляем счётчики с сервера
        refreshUnreadCounts();
        if (document.hidden) {
            if (s.blink) startTitleBlinking();
            if (s.sound) playNotificationSound();
        }
    }
});

socket.on('message_deleted', (d) => removeMessageFromDOM(d.messageId));
socket.on('message_admin_deleted', (d) => markMessageAsAdminDeleted(d.messageId));
socket.on('users_online', (ids) => {
    onlineUserIds = ids;
    updateOnlineStatus(ids);
    updateChatHeader();
});
socket.on('admin_note_updated', (d) => {
    if (String(d.userId) === String(user.id)) loadUserNote();
});
socket.on('messages_read', (d) => { /* визуальные галочки — на будущее */ });

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { stopTitleBlinking(); scrollToBottom(); }
});

initAudioOnUserGesture();