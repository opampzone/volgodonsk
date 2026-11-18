// src/routes/geo.js
const rateLimit = require('express-rate-limit');

// 60 запросов в час с одного IP. Реальный пользователь делает 1 запрос
// за регистрацию, запас большой. Защищает от случайного флуда.
const geoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Слишком много запросов. Попробуйте позже.' }
});

// Кэш по IP на 1 час
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX = 10000;

function getApiKey() {
  const raw = (process.env.DADATA_API_KEY || '').trim();
  if (!raw) return null;
  // Dadata требует префикс «Token ». Добавим, если его нет.
  return raw.startsWith('Token ') ? raw : `Token ${raw}`;
}

module.exports = function (app) {
  app.get('/api/volgodonsk/geo/ip', geoLimiter, async (req, res) => {
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        console.error('❌ DADATA_API_KEY не задан в .env');
        return res.json({ success: true, city: null });
      }

      // ✅ trust proxy = 1 в server.js → req.ip = реальный IP клиента
      const clientIp = String(req.ip || '').replace('::ffff:', '');
      const isLocal = !clientIp || clientIp === '::1' || clientIp.startsWith('127.');

      // Кэш
      if (!isLocal && cache.has(clientIp)) {
        const c = cache.get(clientIp);
        if (Date.now() - c.ts < CACHE_TTL) {
          return res.json({ success: true, city: c.city });
        }
        cache.delete(clientIp);
      }

      // Локальный IP (разработка) — Dadata нечего искать
      if (isLocal) {
        return res.json({ success: true, city: null });
      }

      // Запрос к Dadata
      const resp = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/iplocate/address', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': apiKey
        },
        body: JSON.stringify({ ip: clientIp })
      });

      if (!resp.ok) {
        console.error('Dadata HTTP', resp.status);
        return res.json({ success: true, city: null });
      }

      const data = await resp.json();

      // ✅ ФИКС: Dadata кладёт city/settlement внутрь location.data,
      // а на верхнем уровне только value/unrestricted_value.
      const locData = data?.location?.data;
      const city = locData?.city
                || locData?.settlement
                || data?.location?.value
                || null;

      if (city) {
        if (cache.size >= CACHE_MAX) cache.clear();
        cache.set(clientIp, { city, ts: Date.now() });
      }

      res.json({ success: true, city });
    } catch (e) {
      console.error('geo/ip:', e.message);
      // Клиенту всегда отвечаем «успех, но city: null» — фронт покажет
      // форму для ручного ввода. Внутренние ошибки не палим.
      res.json({ success: true, city: null });
    }
  });
};