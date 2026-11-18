// public/js/club.js
import { apiFetch } from '../chat_js/auth.js';

// 1. Проверка авторизации
const userStr = localStorage.getItem('volg_user');
if (!userStr) {
    window.location.href = '/volgodonsk/login.html';
    throw new Error('no auth');
}
const user = JSON.parse(userStr);

// 2. Выход
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try { await apiFetch('/logout', { method: 'POST' }); } catch (e) {}
        localStorage.removeItem('volg_user');
        localStorage.removeItem('volg_token');
        window.location.href = '/volgodonsk/';
    });
}

// 3. Поиск компонентов
const searchName = document.getElementById('searchName');
const searchCategory = document.getElementById('searchCategory');
const searchBtn = document.getElementById('searchBtn');
const resultsContainer = document.getElementById('resultsContainer');

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

async function loadComponents() {
    resultsContainer.innerHTML = '<div class="loading">Загрузка компонентов...</div>';

    const nameQuery = searchName.value.trim();
    const categoryQuery = searchCategory.value;

    const params = new URLSearchParams();
    if (nameQuery) params.set('name', nameQuery);
    if (categoryQuery) params.set('category', categoryQuery);
    const query = params.toString();

    try {
        const res = await apiFetch(`/components/search${query ? '?' + query : ''}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Ошибка сервера');
        renderComponents(data.items);
    } catch (err) {
        resultsContainer.innerHTML = `<div class="empty-state">❌ Ошибка загрузки: ${escapeHtml(err.message)}</div>`;
    }
}

function renderComponents(items) {
    if (!items || items.length === 0) {
        resultsContainer.innerHTML = '<div class="empty-state">📭 Компоненты не найдены. Попробуйте изменить запрос.</div>';
        return;
    }

    resultsContainer.innerHTML = items.map(item => {
        const contactRaw = String(item.contact || '');

        // Telegram: @username
        let telegramLink = '';
        const tgMatch = contactRaw.match(/^@([a-zA-Z0-9_]{4,32})$/);
        if (tgMatch) {
            const tgUser = encodeURIComponent(tgMatch[1]);
            telegramLink = `<a href="https://t.me/${tgUser}" class="contact-link" target="_blank" rel="noopener noreferrer">Telegram</a>`;
        }

        // Телефон: +7... или 8...
        let phoneHtml = escapeHtml(contactRaw);
        if (/^\+?\d[\d\s\-()]{5,}$/.test(contactRaw)) {
            const digits = contactRaw.replace(/\D/g, '');
            phoneHtml = `<a href="tel:${encodeURIComponent(digits)}" class="contact-link">${escapeHtml(contactRaw)}</a>`;
        }

        return `
      <div class="item-card">
        <div class="item-header">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-category">${escapeHtml(item.category)}</div>
        </div>
        <div class="item-details">
          <div class="detail-box">
            <div class="detail-label">Количество</div>
            <div class="detail-value">${Number(item.qty) || 0} шт.</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Цена</div>
            <div class="detail-value price">${Number(item.price) > 0 ? Number(item.price) + ' ₽' : 'Договорная'}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Состояние</div>
            <div class="detail-value">${escapeHtml(item.condition)}</div>
          </div>
        </div>
        ${item.description ? `<div style="color:#ccc; font-size:14px; margin-bottom:10px;">${escapeHtml(item.description)}</div>` : ''}
        
        <div class="seller-info">
          <div class="seller-name">👤 ${escapeHtml(item.owner_name)} (${escapeHtml(item.city)})</div>
          <div class="seller-contact">
            📞 Контакт: ${phoneHtml}
            ${telegramLink ? `| ${telegramLink}` : ''}
          </div>
        </div>
      </div>
    `;
    }).join('');
}

searchBtn.addEventListener('click', loadComponents);
searchName.addEventListener('keypress', (e) => { if (e.key === 'Enter') loadComponents(); });

loadComponents();