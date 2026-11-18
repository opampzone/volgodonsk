// src/routes/password.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const nodemailer = require('nodemailer');
const { passwordLimiter, passwordResetLimiter } = require('../middleware/rateLimit');

const BCRYPT_ROUNDS = 12;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.yandex.ru',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

function generateTempPassword() {
  return String(crypto.randomInt(100000, 1000000));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = function registerPasswordRoutes(app) {

  app.post('/api/volgodonsk/password/forgot', passwordLimiter, async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ success: false, error: 'Введите email' });

      const normalizedEmail = String(email).trim().toLowerCase();
      const successMessage = 'Если этот email зарегистрирован, мы отправили на него временный пароль. Проверьте почту (и папку "Спам").';

      const { rows } = await pool.query(
        'SELECT id, login, email, full_name FROM users WHERE email = $1',
        [normalizedEmail]
      );
      if (rows.length === 0) return res.json({ success: true, message: successMessage });

      const user = rows[0];
      const tempPassword = generateTempPassword();
      const tempPasswordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await pool.query(
        'UPDATE users SET temp_password = $1, temp_password_expires = $2 WHERE id = $3',
        [tempPasswordHash, expiresAt.toISOString(), user.id]
      );

      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Электроника Волгодонска" <elplus7.notification@yandex.ru>',
        to: user.email,
        subject: '🔐 Восстановление пароля — Электроника Волгодонска',
        html: `<div style="font-family:Arial;max-width:500px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:8px;">
          <h2 style="color:#4caf50;">Здравствуйте, ${escapeHtml(user.full_name || user.login)}!</h2>
          <p>Ваш временный код для входа:</p>
          <div style="background:#f4f4f4;padding:15px;text-align:center;font-size:24px;font-weight:bold;letter-spacing:5px;border-radius:4px;color:#333;">${tempPassword}</div>
          <p style="color:#666;font-size:14px;">⚠️ Код действителен 15 минут. Если вы не запрашивали восстановление — проигнорируйте письмо.</p>
        </div>`
      });

      res.json({ success: true, message: successMessage });
    } catch (error) {
      console.error('❌ forgot:', error);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });

  app.post('/api/volgodonsk/password/reset', passwordResetLimiter, async (req, res) => {
    try {
      const { tempPassword, newPassword, email } = req.body || {};
      if (!tempPassword || !newPassword || !email) {
        return res.status(400).json({ success: false, error: 'Заполните все поля' });
      }
      if (newPassword.length < 8 || newPassword.length > 128) {
        return res.status(400).json({ success: false, error: 'Пароль должен быть 8–128 символов' });
      }

      const { rows } = await pool.query(
        'SELECT id, temp_password, temp_password_expires FROM users WHERE email = $1',
        [String(email).trim().toLowerCase()]
      );
      if (rows.length === 0) return res.status(400).json({ success: false, error: 'Неверный код' });

      const user = rows[0];
      if (!user.temp_password || !user.temp_password_expires) {
        return res.status(400).json({ success: false, error: 'Запросите новый код' });
      }
      if (new Date() > new Date(user.temp_password_expires)) {
        return res.status(400).json({ success: false, error: 'Код истёк. Запросите новый.' });
      }
      const ok = await bcrypt.compare(String(tempPassword), user.temp_password);
      if (!ok) return res.status(400).json({ success: false, error: 'Неверный код' });

      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await pool.query(
        'UPDATE users SET password = $1, temp_password = NULL, temp_password_expires = NULL WHERE id = $2',
        [newHash, user.id]
      );
      res.json({ success: true, message: 'Пароль успешно изменён!' });
    } catch (error) {
      console.error('❌ reset:', error);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });
};