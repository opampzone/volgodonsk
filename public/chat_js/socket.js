// public/chat_js/socket.js
import { getToken } from './auth.js';

export function initSocket() {
    const socket = io({ auth: { token: getToken() } });

    const setStatus = (text) => {
        const el = document.getElementById('online-status');
        if (el) el.textContent = text;
    };

    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        setStatus('🟢 Подключено');
    });

    socket.on('disconnect', () => {
        setStatus('🔌 Отключено');
    });

    socket.on('connect_error', (err) => {
        console.error('Socket error:', err.message);
        if (['invalid_token', 'no_token', 'user_not_found', 'banned'].includes(err.message)) {
            localStorage.removeItem('volg_user');
            localStorage.removeItem('volg_token');
            window.location.href = '/volgodonsk/login.html';
        }
    });

    return socket;
}