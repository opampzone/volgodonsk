export function appendMessage(msg, isMyMessage, isAdmin) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    const isDeletedByAdmin = msg.admin_deleted === true;
    div.className = `message ${isMyMessage ? 'my-message' : 'other-message'} ${isDeletedByAdmin ? 'admin-deleted-message' : ''}`;
    div.dataset.id = msg.id;

    let html = '';
    if (!isMyMessage) {
        html += `<div class="message-author">${escapeHtml(msg.full_name || msg.login || 'Аноним')}</div>`;
    }
    
    if (isDeletedByAdmin) {
        html += `<div class="message-text admin-deleted-text">🚫 Удалено по обращению</div>`;
    } else {
        if (msg.text) {
            html += `<div class="message-text">${escapeHtml(msg.text)}</div>`;
        }
        if (msg.image_url) {
            html += `<img src="${msg.image_url}" alt="Изображение" loading="lazy" onclick="window.open(this.src)">`;
        }
    }
    
    html += `<div class="message-meta">${formatTime(msg.created_at)}</div>`;
    
    // Кнопки действий
    let actionButtons = '';
    if (!isDeletedByAdmin) {
        if (isMyMessage || isAdmin) {
            actionButtons += `<button class="delete-btn" data-id="${msg.id}" title="Удалить">🗑️</button>`;
        }
        if (!isMyMessage) {
            actionButtons += `<button class="report-btn" data-id="${msg.id}" data-user="${msg.user_id}" title="Пожаловаться">⚠️</button>`;
        }
    }
    
    if (actionButtons) {
        html += `<div class="message-actions">${actionButtons}</div>`;
    }

    div.innerHTML = html;
    container.appendChild(div);
    scrollToBottom();
}

export function clearMessages() {
    document.getElementById('chat-messages').innerHTML = '';
}

export function scrollToBottom() {
    const c = document.getElementById('chat-messages');
    c.scrollTop = c.scrollHeight;
}

export function removeMessageFromDOM(messageId) {
    const el = document.querySelector(`.message[data-id="${messageId}"]`);
    if (el) {
        el.classList.add('deleting');
        setTimeout(() => el.remove(), 500);
    }
}

// Обновление сообщения на "Удалено по обращению" без перезагрузки
export function markMessageAsAdminDeleted(messageId) {
    const el = document.querySelector(`.message[data-id="${messageId}"]`);
    if (el) {
        el.classList.add('admin-deleted-message');
        const textEl = el.querySelector('.message-text');
        if (textEl) {
            textEl.textContent = '🚫 Удалено по обращению';
            textEl.classList.add('admin-deleted-text');
        }
        // Убираем картинку, если была
        const imgEl = el.querySelector('img');
        if (imgEl) imgEl.remove();
        // Убираем кнопки действий
        const actions = el.querySelector('.message-actions');
        if (actions) actions.remove();
    }
}

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function formatTime(s) { return new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }