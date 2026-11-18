/**
 * Модуль автоматической фильтрации и валидации сообщений
 * Оптимизирован для чата по электронике и микроконтроллерам.
 */

export function validateMessage(text) {
    if (!text || text.trim().length === 0) {
        return { isValid: false, reason: "Сообщение не может быть пустым" };
    }

    // 0. ГЛОБАЛЬНЫЕ ИСКЛЮЧЕНИЯ (Белый список)
    // Пропускаем URL без проверок
    if (/https?:\/\/|www\./i.test(text)) {
        return { isValid: true };
    }
    // Пропускаем блоки кода и явный синтаксис программирования
    if (/```|#include|void\s+\w+|function\s+\w+|import\s+|{\s*}/.test(text)) {
        return { isValid: true };
    }

    // 1. ПРЕДВАРИТЕЛЬНАЯ ОБРАБОТКА
    // Добавляем пробелы после запятых и точек, если они слиплись с буквами 
    // (но не трогаем дробные числа вроде 3.3, проверяя контекст)
    let normalizedText = text.replace(/([a-zA-Zа-яА-Я]),([a-zA-Zа-яА-Я])/g, '$1, $2');
    normalizedText = normalizedText.replace(/([a-zA-Zа-яА-Я])\.([a-zA-Zа-яА-Я])/g, '$1. $2');

    // 2. ПРОВЕРКА НА ПОВТОРЯЮЩИЕСЯ СИМВОЛЫ (Спам)
    // (.)\1{4,} означает: любой символ, повторяющийся 5 и более раз подряд
    if (/(.)\1{4,}/.test(normalizedText)) {
        return { isValid: false, reason: "Обнаружен спам: повторение одного символа 5 и более раз подряд" };
    }

    // 3. ПРОВЕРКА НА КЛАВИАТУРНУЮ АБРАКАДАБРУ
    const keyboardRows = [
        'йцукенгшщзхъфывапролджэячсмитьбю',
        'asdfghjklqwertyuiopzxcvbnm'
    ];
    for (const row of keyboardRows) {
        for (let i = 0; i <= row.length - 6; i++) {
            const seq = row.substring(i, i + 6); // Ищем последовательности от 6 символов
            if (normalizedText.toLowerCase().includes(seq)) {
                return { isValid: false, reason: "Текст похож на случайный набор символов (клавиатурная абракадабра)" };
            }
        }
    }

    // 4. ПРОВЕРКА ДЛИНЫ НЕПРЕРЫВНОГО ТЕКСТА И СОГЛАСНЫХ
    const tokens = normalizedText.split(/\s+/);
    const vowelsRegex = /[аеёиоуыэюяaeiouy]/i;
    
    // Регулярные выражения для "белого списка" электроники
    const isComponent = /^[A-Z0-9\-]+$/i;          // STM32F103C8T6, ESP32-S3, КТ315
    const isValueUnit = /^\d+([.,]\d+)?[a-zA-Zа-яА-Я]+$/; // 10кОм, 4.7k, 3.3V, 100мкФ, 2.4ГГц
    const isShortAbbr = /^[A-ZА-Я]{1,8}$/;         // ШИМ, АЦП, UART, GPIO, GND

    let totalQualifyingWords = 0;
    let consonantOnlyWords = 0;

    for (const token of tokens) {
        // Очищаем токен от знаков препинания в конце для анализа
        const cleanToken = token.replace(/[.,;:!?]+$/, '');

        // А. Проверка на "стену текста" (> 30 символов без пробелов)
        if (cleanToken.length > 30) {
            // Разрешаем, если это похоже на легитимный длинный артикул, хеш или домен
            if (!/^[A-Za-z0-9\-\.]+$/.test(cleanToken)) {
                return { isValid: false, reason: "Сообщение содержит слишком длинный неразрывный текст (более 30 символов)" };
            }
        }

        // Б. Проверка на бессвязный набор согласных (только для слов от 5 букв, состоящих только из букв)
        if (cleanToken.length >= 5 && /^[a-zA-Zа-яА-Я]+$/.test(cleanToken)) {
            // Если это известный термин электроники — пропускаем проверку
            if (isShortAbbr.test(cleanToken) || isComponent.test(cleanToken) || isValueUnit.test(cleanToken)) {
                continue; 
            }

            totalQualifyingWords++;
            if (!vowelsRegex.test(cleanToken)) {
                consonantOnlyWords++;
            }
        }
    }

    // Если более 40% проверенных слов состоят только из согласных — это спам
    if (totalQualifyingWords > 0 && (consonantOnlyWords / totalQualifyingWords) > 0.4) {
        return { isValid: false, reason: "Текст содержит слишком много слов без гласных, похоже на бессвязный набор символов" };
    }

    // Если все проверки пройдены
    return { isValid: true };
}

// ==========================================
// ВСТРОЕННЫЕ ЮНИТ-ТЕСТЫ (для самопроверки)
// ==========================================
export function runValidatorTests() {
    console.log("🧪 Запуск тестов валидатора сообщений...");
    
    const tests = [
        // ДОЛЖНЫ БЫТЬ ЗАБЛОКИРОВАНЫ (isValid: false)
        { text: "ааааааааааааааааааааааааааааааааааа", shouldPass: false, desc: "Спам: повтор символов" },
        { text: "фывапролдж йцукенгшщз", shouldPass: false, desc: "Клавиатурная абракадабра (RU)" },
        { text: "asdfghjkl qwertyuiop", shouldPass: false, desc: "Клавиатурная абракадабра (EN)" },
        { text: "приветкакделачтотыделаешьбезпробеловдлиннаястрока", shouldPass: false, desc: "Стена текста > 30 символов" },
        { text: "впргшщзх смтрлд нчгкбв длгщтв", shouldPass: false, desc: "Бессвязный набор согласных (>40%)" },
        
        // ДОЛЖНЫ БЫТЬ ПРОПУЩЕНЫ (isValid: true)
        { text: "Привет,подскажи по схеме на STM32F103C8T6, там ШИМ и АЦП настроены на 10кОм и 100мкФ.", shouldPass: true, desc: "Слитное написание + компоненты + аббревиатуры + номиналы" },
        { text: "https://www.example.com/very/long/url/that/is/definitely/over/30/characters/long", shouldPass: true, desc: "Длинный URL (исключение)" },
        { text: "```cpp\n#include <Arduino.h>\nvoid setup() {}\n```", shouldPass: true, desc: "Блок кода (исключение)" },
        { text: "ESP32-S3-WROOM-1 и IRF3205 в корпусе SMD, питание 3.3V и 50Hz", shouldPass: true, desc: "Сложные артикулы и единицы измерения" },
        { text: "ПЛИС UART SPI I2C CAN PWM GPIO MOSFET IGBT DIP GND VCC", shouldPass: true, desc: "Набор легитимных аббревиатур без гласных" }
    ];

    let passed = 0;
    tests.forEach((test, index) => {
        const result = validateMessage(test.text);
        const success = result.isValid === test.shouldPass;
        if (success) {
            console.log(`✅ Тест ${index + 1} пройден: ${test.desc}`);
            passed++;
        } else {
            console.error(`❌ Тест ${index + 1} ПРОВАЛЕН: ${test.desc}`);
            console.error(`   Ожидалось: ${test.shouldPass ? 'Пропуск' : 'Блокировка'}, Получено: ${result.isValid ? 'Пропуск' : 'Блокировка'} (${result.reason})`);
        }
    });

    console.log(`🏁 Итог: ${passed} из ${tests.length} тестов пройдено.`);
    return passed === tests.length;
}