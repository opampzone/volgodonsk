// Белый список населённых пунктов (кириллица + латиница)
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

function normalizeLocation(location) {
  if (!location) return '';
  return location
    .toLowerCase()
    .replace(/^(ст\-ца|станица|х\.|хутор|п\.|посёлок|пос\.|дер\.|деревня|с\.|село|рп\.|рабочий поселок)\s+/i, '')
    .trim();
}

function isValidLocation(location) {
  const normalized = normalizeLocation(location);
  return ALLOWED_LOCATIONS.some(allowed => normalized.includes(allowed));
}

module.exports = { ALLOWED_LOCATIONS, normalizeLocation, isValidLocation };
