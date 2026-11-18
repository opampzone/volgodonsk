// public/chat_js/settings.js
const SETTINGS_KEY = 'volg_chat_settings';

const defaultSettings = {
    sound: true,
    blink: true,
    fontSize: 'medium',
    showPhone: false
};

export function loadSettings() {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
        return { ...defaultSettings };
    }
}

export function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    applySettings(settings);
}

// Безопасно: не падает, если какого-то элемента нет в HTML
export function applySettings(settings) {
    const sound = document.getElementById('setting-sound');
    if (sound) sound.checked = settings.sound;

    const blink = document.getElementById('setting-blink');
    if (blink) blink.checked = settings.blink;

    const fontsize = document.getElementById('setting-fontsize');
    if (fontsize) fontsize.value = settings.fontSize;

    const phone = document.getElementById('setting-phone');
    if (phone) phone.checked = settings.showPhone;

    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    document.body.classList.add(`font-${settings.fontSize}`);
}

export function clearCurrentChatLocally() {
    const container = document.getElementById('chat-messages');
    if (container) {
        container.innerHTML = '<div class="system-message">Чат очищен. История загружается...</div>';
    }
}