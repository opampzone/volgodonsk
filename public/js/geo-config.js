// public/js/geo-config.js
// =====================================================
// ОБЩИЙ ФАЙЛ ГЕОЛОКАЦИИ
// Ключ Dadata живёт на сервере (.env). Браузер запрашивает /api/volgodonsk/geo/ip.
// =====================================================

const ALLOWED_LOCATIONS = [
  'волгодонск', 'цимлянск', 'романовская', 'лагутники', 'парамонов',
  'погожев', 'солнечный', 'мокросоленый', 'саловский', 'сухая балка',
  'дубенцовская', 'морозов', 'пирожок', 'победа', 'донской',
  'краснодонский', 'мичуринский', 'свобода', 'потапов', 'егоров',
  'казинка', 'калинин', 'каргальская', 'савельевский', 'степной',
  'фролов', 'прогресс', 'виноградный', 'головное', 'рябичев',
  'большовская', 'сибирьковый', 'холодный', 'ясырев', 'семёнкин',
  'жуковская',
  'volgodonsk', 'tsimlyansk', 'romanovskaya', 'lagutniki', 'paramonov',
  'pogozhev', 'solnechny', 'mokrosoleny', 'salovsky', 'sukhaya balka',
  'dubentsovskaya', 'morozov', 'pirozhok', 'pobeda', 'donskoy',
  'krasnodonsky', 'michurinsky', 'svoboda', 'potapov', 'egorov',
  'kazinka', 'kalinin', 'kargalskaya', 'savelevsky', 'stepnoy',
  'frolov', 'progress', 'vinogradny', 'golovnoe', 'ryabichev',
  'bolshovskaya', 'sibirkovy', 'kholodny', 'yasyrev', 'semenkin',
  'zhukovskaya'
];

// ✅ ФИКС: добавлены «г.», «город» — Dadata иногда возвращает "г Волгодонск"
function normalizeLocation(loc) {
  if (!loc) return '';
  return loc.toLowerCase()
    .replace(/^(г\.?|город|ст\-ца|станица|х\.?|хутор|п\.?|посёлок|пос\.?|дер\.?|деревня|с\.?|село|рп\.?|рабочий поселок)\s+/i, '')
    .trim();
}

function transliterate(text) {
  const map = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
    'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
    'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
    'ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
  };
  return text.toLowerCase().split('').map(char => map[char] || char).join('');
}

function isValidLocation(location) {
  const normalized = normalizeLocation(location);
  const transliterated = transliterate(normalized);
  return ALLOWED_LOCATIONS.some(allowed =>
    normalized.includes(allowed) || transliterated.includes(allowed)
  );
}

// --- GPS через Nominatim (без ключа, публичный OSM) ---
async function getCityByGPS() {
  if (!navigator.geolocation) return null;

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 10000,
        maximumAge: 10 * 60 * 1000,
        enableHighAccuracy: false
      });
    });

    const url = 'https://nominatim.openstreetmap.org/reverse'
      + `?format=json&lat=${position.coords.latitude}`
      + `&lon=${position.coords.longitude}`
      + '&accept-language=ru&zoom=10';

    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;

    const data = await res.json();
    return data.address?.city
        || data.address?.town
        || data.address?.village
        || data.address?.hamlet
        || null;
  } catch (e) {
    console.log('GPS недоступен:', e.message);
    return null;
  }
}

// --- IP через наш серверный прокси (ключ Dadata на сервере) ---
async function getCityByIP() {
  try {
    const res = await fetch('/api/volgodonsk/geo/ip', {
      credentials: 'same-origin'
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data.city : null;
  } catch (e) {
    console.log('IP-определение недоступно:', e.message);
    return null;
  }
}

// Главная функция: GPS → IP → null (ручной ввод)
async function detectCity() {
  let city = await getCityByGPS();
  if (!city) city = await getCityByIP();
  return city;
}