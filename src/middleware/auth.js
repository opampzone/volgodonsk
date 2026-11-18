// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { SECRET, COOKIE_NAME } = require('../config/jwt');

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  return null;
}

async function authRequired(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ success: false, error: 'Требуется авторизация' });

    let payload;
    try { payload = jwt.verify(token, SECRET); }
    catch (e) { return res.status(401).json({ success: false, error: 'Недействительный токен' }); }

    const { rows } = await pool.query(
      'SELECT id, login, is_admin, is_banned FROM users WHERE id = $1',
      [payload.sub]
    );
    if (rows.length === 0) return res.status(401).json({ success: false, error: 'Пользователь не найден' });
    if (rows[0].is_banned) return res.status(403).json({ success: false, error: 'Аккаунт заблокирован' });

    req.user = rows[0];
    next();
  } catch (e) {
    console.error('auth middleware:', e);
    res.status(500).json({ success: false, error: 'Внутренняя ошибка' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ success: false, error: 'Доступ только для администратора' });
  }
  next();
}

module.exports = { authRequired, adminRequired, extractToken };