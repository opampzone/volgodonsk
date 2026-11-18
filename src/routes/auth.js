// src/routes/auth.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { SECRET, EXPIRES_IN, COOKIE_NAME } = require('../config/jwt');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimit');
const { authRequired } = require('../middleware/auth');
const { isValidLocation } = require('../config/geo');
const { getSetting } = require('../config/settings');

const BCRYPT_ROUNDS = 12;
const LOGIN_RE = /^[a-z0-9_.-]{3,50}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign({ sub: user.id, login: user.login }, SECRET, { expiresIn: EXPIRES_IN });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function publicUser(u) {
  return {
    id: u.id, login: u.login, email: u.email, full_name: u.full_name,
    roles: u.roles, repairman_type: u.repairman_type, specializations: u.specializations,
    resume: u.resume, phone: u.phone, telegram: u.telegram,
    location: u.location, is_admin: u.is_admin
  };
}

// Универсальная проверка пароля: bcrypt ИЛИ legacy plaintext (с авто-миграцией)
async function verifyPassword(plain, storedHash) {
  if (!storedHash) return { ok: false };
  if (String(storedHash).startsWith('$2')) {
    const ok = await bcrypt.compare(String(plain), storedHash);
    return { ok };
  }
  // Legacy plaintext (до миграции)
  if (storedHash === plain) return { ok: true, needsRehash: true };
  return { ok: false };
}

async function rehash(userId, plainPassword) {
  const hash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
  await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, userId]);
}

// Нормализация телефона. Возвращает { value } или { error }
function normalizePhone(phone) {
  if (!phone || String(phone).trim() === '') return { value: null };
  let digits = String(phone).trim().replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) digits = '7' + digits;
  else if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.substring(1);
  if (digits.length !== 11 || !digits.startsWith('7')) {
    return { error: 'Введите корректный российский номер (например, 89881234567)' };
  }
  return { value: digits };
}

module.exports = function registerAuthRoutes(app) {

  // === РЕГИСТРАЦИЯ ===
  app.post('/api/volgodonsk/register', registerLimiter, async (req, res) => {
    try {
      if (getSetting('maintenance_mode', false)) {
        return res.status(503).json({ success: false, error: 'Сервис на обслуживании' });
      }
      if (!getSetting('registration_open', true)) {
        return res.status(403).json({ success: false, error: 'Регистрация временно закрыта' });
      }

      const {
        login, password, email, full_name, roles,
        repairman_type, specializations, resume, phone, telegram, location
      } = req.body || {};

      if (!login || !password || !full_name || !location) {
        return res.status(400).json({ success: false, error: 'Заполните все обязательные поля' });
      }
      if (password.length < 8 || password.length > 128) {
        return res.status(400).json({ success: false, error: 'Пароль должен быть 8–128 символов' });
      }
      if (!Array.isArray(roles) || roles.length === 0) {
        return res.status(400).json({ success: false, error: 'Выберите хотя бы одну роль' });
      }
      if (!isValidLocation(location)) {
        return res.status(400).json({ success: false, error: 'Укажите населённый пункт из разрешённого списка' });
      }

      const normalizedLogin = String(login).trim().toLowerCase();
      if (!LOGIN_RE.test(normalizedLogin)) {
        return res.status(400).json({ success: false, error: 'Логин: 3–50 символов, a-z, 0-9, _ . -' });
      }

      const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
      if (normalizedEmail && !EMAIL_RE.test(normalizedEmail)) {
        return res.status(400).json({ success: false, error: 'Некорректный email' });
      }

      const phoneResult = normalizePhone(phone);
      if (phoneResult.error) return res.status(400).json({ success: false, error: phoneResult.error });
      const normalizedPhone = phoneResult.value;

      // Уникальность
      const { rows: byLogin } = await pool.query('SELECT 1 FROM users WHERE login = $1', [normalizedLogin]);
      if (byLogin.length) return res.status(400).json({ success: false, error: 'Этот логин уже занят' });
      if (normalizedEmail) {
        const { rows } = await pool.query('SELECT 1 FROM users WHERE email = $1', [normalizedEmail]);
        if (rows.length) return res.status(400).json({ success: false, error: 'Этот email уже зарегистрирован' });
      }
      if (normalizedPhone) {
        const { rows } = await pool.query('SELECT 1 FROM users WHERE phone = $1', [normalizedPhone]);
        if (rows.length) return res.status(400).json({ success: false, error: 'Этот номер уже зарегистрирован' });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const result = await pool.query(
        `INSERT INTO users
          (login, password, email, full_name, roles, repairman_type, specializations,
           resume, phone, telegram, location)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, login, email, full_name, roles, repairman_type, specializations,
                   resume, phone, telegram, location, is_admin`,
        [
          normalizedLogin, passwordHash, normalizedEmail, String(full_name).trim().slice(0, 255),
          roles, repairman_type || null, specializations || [], resume || null,
          normalizedPhone, telegram || null, String(location).trim().slice(0, 255)
        ]
      );
      const newUser = result.rows[0];
      const token = signToken(newUser);
      setAuthCookie(res, token);

      res.json({
        success: true,
        message: 'Регистрация успешна!',
        token,
        user: publicUser(newUser)
      });
    } catch (error) {
      console.error('❌ Регистрация:', error);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });

  // === ВХОД ===
  app.post('/api/volgodonsk/login', loginLimiter, async (req, res) => {
    try {
      const { login, password } = req.body || {};
      if (!login || !password) {
        return res.status(400).json({ success: false, error: 'Введите логин и пароль' });
      }

      const { rows } = await pool.query(
        'SELECT * FROM users WHERE login = $1',
        [String(login).trim().toLowerCase()]
      );
      if (rows.length === 0) {
        return res.status(401).json({ success: false, error: 'Неверный логин или пароль' });
      }

      const user = rows[0];
      if (user.is_banned) {
        return res.status(403).json({ success: false, error: 'Аккаунт заблокирован' });
      }

      const check = await verifyPassword(password, user.password);
      if (!check.ok) {
        return res.status(401).json({ success: false, error: 'Неверный логин или пароль' });
      }

      // Auto-migration: старый plaintext → bcrypt
      if (check.needsRehash) {
        await rehash(user.id, password);
        console.log(`🔐 Пароль пользователя ${user.login} миграирован в bcrypt`);
      }

      const token = signToken(user);
      setAuthCookie(res, token);
      res.json({ success: true, token, user: publicUser(user) });
    } catch (error) {
      console.error('❌ Вход:', error);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });

  // === ВЫХОД ===
  app.post('/api/volgodonsk/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ success: true });
  });

  // === ОБНОВЛЕНИЕ ПРОФИЛЯ / ПАРОЛЯ ===
  app.post('/api/volgodonsk/user/update', authRequired, async (req, res) => {
    try {
      const { email, phone, telegram, currentPassword, newPassword } = req.body || {};
      const userId = req.user.id;

      // --- Смена пароля ---
      if (currentPassword && newPassword) {
        if (newPassword.length < 8 || newPassword.length > 128) {
          return res.status(400).json({ success: false, error: 'Новый пароль должен быть 8–128 символов' });
        }
        const { rows } = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Пользователь не найден' });

        const check = await verifyPassword(currentPassword, rows[0].password);
        if (!check.ok) {
          return res.status(400).json({ success: false, error: 'Текущий пароль указан неверно' });
        }

        const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newHash, userId]);
        return res.json({ success: true, message: 'Пароль успешно изменён' });
      }

      // --- Смена контактов ---
      const phoneResult = normalizePhone(phone);
      if (phoneResult.error) return res.status(400).json({ success: false, error: phoneResult.error });
      const normalizedPhone = phoneResult.value;

      const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
      if (normalizedEmail && !EMAIL_RE.test(normalizedEmail)) {
        return res.status(400).json({ success: false, error: 'Некорректный email' });
      }

      // Проверка уникальности (исключая себя)
      if (normalizedEmail) {
        const { rows } = await pool.query(
          'SELECT 1 FROM users WHERE email = $1 AND id <> $2',
          [normalizedEmail, userId]
        );
        if (rows.length) return res.status(400).json({ success: false, error: 'Этот email уже используется' });
      }
            if (normalizedPhone) {
        const { rows } = await pool.query(
          'SELECT 1 FROM users WHERE phone = $1 AND id <> $2',
          [normalizedPhone, userId]
        );
        if (rows.length) return res.status(400).json({ success: false, error: 'Этот номер уже используется' });
      }
      const cleanTelegram = telegram ? String(telegram).trim().slice(0, 100) : null;
      await pool.query(
        'UPDATE users SET email = $1, phone = $2, telegram = $3 WHERE id = $4',
        [normalizedEmail, normalizedPhone, cleanTelegram, userId]
      );

      res.json({
        success: true,
        message: 'Профиль обновлён',
        user: { email: normalizedEmail, phone: normalizedPhone, telegram: cleanTelegram }
      });

    } catch (e) {
      console.error('Update profile:', e);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });

  // === УДАЛЕНИЕ АККАУНТА ===
  app.post('/api/volgodonsk/user/delete', authRequired, async (req, res) => {
    const client = await pool.connect();
    try {
      const { password } = req.body || {};
      const userId = req.user.id;

      if (!password) return res.status(400).json({ success: false, error: 'Введите пароль' });

      const { rows } = await client.query('SELECT password FROM users WHERE id = $1', [userId]);
      if (rows.length === 0) return res.status(404).json({ success: false, error: 'Пользователь не найден' });

      const check = await verifyPassword(password, rows[0].password);
      if (!check.ok) return res.status(400).json({ success: false, error: 'Неверный пароль' });

      await client.query('BEGIN');

      // Жалобы: FK в вашей схеме без ON DELETE CASCADE — чистим явно
      await client.query(
        'DELETE FROM chat_reports WHERE reporter_id = $1 OR reported_user_id = $1',
        [userId]
      );

      // Остальное удалится каскадом (components, chat_messages, private_messages)
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
      await client.query('COMMIT');

      res.clearCookie(COOKIE_NAME);
      res.json({ success: true, message: 'Аккаунт успешно удалён' });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Delete account:', e);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    } finally {
      client.release();
    }
  });
};