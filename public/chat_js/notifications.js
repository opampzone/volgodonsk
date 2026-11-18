let audioCtx = null;
let blinkInterval = null;
const originalTitle = document.title;

// Инициализация аудио (максимально совместимая с мобильными)
export function initAudioOnUserGesture() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
        audioCtx = new AudioContext();
    }

    // Функция "пробуждения" аудио при любом касании/клике
    const wakeUpAudio = async () => {
        if (audioCtx && audioCtx.state === 'suspended') {
            try {
                await audioCtx.resume();
            } catch (e) {
                console.warn('Не удалось разблокировать AudioContext:', e);
            }
        }
        // Удаляем слушатели после первого успешного касания
        document.removeEventListener('click', wakeUpAudio, true);
        document.removeEventListener('touchstart', wakeUpAudio, true);
        document.removeEventListener('touchend', wakeUpAudio, true);
    };

    // Вешаем на capture phase (true), чтобы сработало максимально рано
    document.addEventListener('click', wakeUpAudio, true);
    document.addEventListener('touchstart', wakeUpAudio, true);
    document.addEventListener('touchend', wakeUpAudio, true);
}

function beep(freq, startOffset) {
    if (!audioCtx) return;
    
    // Если контекст приостановлен (например, пользователь свернул браузер), пытаемся возобновить
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    
    const t = audioCtx.currentTime + startOffset;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    // Делаем звук чуть громче для мобильных динамиков
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.41);
}

export function playNotificationSound() {
    if (!audioCtx) {
        // Попытка создать контекст "на лету" (может не сработать без жеста, но мы обязаны попробовать)
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
        else return;
    }
    
    beep(880, 0);
    beep(660, 0.18);
}

export function startTitleBlinking() {
    if (blinkInterval) return;
    let on = false;
    blinkInterval = setInterval(() => {
        document.title = on ? originalTitle : '🔔 Новое сообщение!';
        on = !on;
    }, 1000);
}

export function stopTitleBlinking() {
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
        document.title = originalTitle;
    }
}