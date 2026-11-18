// /var/www/volgodonsk/public/sw.js
const CACHE_NAME = 'volgodonsk-cache-v2'; // Увеличили версию, чтобы сбросить старый кэш

// 1. Установка: сразу активируем новый SW
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 2. Активация: очищаем старые кэши и перехватываем управление
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Перехват запросов: безопасная стратегия "Сеть с обработкой ошибок"
self.addEventListener('fetch', (event) => {
  // Игнорируем запросы, которые не являются GET или относятся к расширениям браузера
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Если сервер ответил (даже с ошибкой 404/500), возвращаем ответ
        return response;
      })
      .catch((error) => {
        // Если сеть полностью недоступна (DNS, нет интернета, сервер упал)
        console.warn('[SW] Network request failed:', error);
        return new Response('Сервер временно недоступен. Пожалуйста, обновите страницу или проверьте подключение к интернету.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});