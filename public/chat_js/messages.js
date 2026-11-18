// Только защита от двойного клика (UI cooldown)
// Вся реальная защита от спама теперь на сервере (возвращает 429 Too Many Requests)

let lastSendTime = 0;
const UI_COOLDOWN = 1000; // 1 секунда

export function canSend() {
    const now = Date.now();
    if (now - lastSendTime < UI_COOLDOWN) {
        return false; // Блокируем только если кликнули быстрее 1 секунды
    }
    lastSendTime = now;
    return true;
}

export function isCooldownActive() {
    return false; // Убрали старый таймер, теперь сервер сам говорит, когда можно писать
}