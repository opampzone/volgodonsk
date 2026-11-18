// src/routes/chat.js
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { getSetting } = require('../config/settings');
const { authRequired } = require('../middleware/auth');
const { messageLimiter, reportLimiter } = require('../middleware/rateLimit');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/chat');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

async function containsBannedWords(text) {
  if (!text) return false;
  const { rows } = await pool.query('SELECT word FROM banned_words');
  const lower = String(text).toLowerCase();
  return rows.some(r => lower.includes(r.word.toLowerCase()));
}

async function checkSpam(userId, isPrivate) {
  const threshold = parseInt(getSetting('spam_threshold', 5));
  const windowSec = parseInt(getSetting('spam_block_duration', 60));
  const table = isPrivate ? 'private_messages' : 'chat_messages';
  const col = isPrivate ? 'sender_id' : 'user_id';
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS c, MIN(created_at) AS oldest FROM ' + table +
    ' WHERE ' + col + ' = $1 AND created_at > NOW() - ($2 || \' seconds\')::interval',
    [userId, String(windowSec)]
  );
  if (rows[0].c >= threshold) {
    const oldest = new Date(rows[0].oldest).getTime();
    const passed = Math.floor((Date.now() - oldest) / 1000);
    return { blocked: true, remainingSeconds: Math.max(1, windowSec - passed) };
  }
  return { blocked: false };
}

module.exports = function (app, io) {

  app.get('/api/volgodonsk/users', authRequired, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, full_name, login, ' +
        'CASE WHEN show_phone_in_private = true THEN phone ELSE null END as phone ' +
        'FROM users WHERE id <> $1 AND is_banned = false ORDER BY full_name ASC LIMIT 2000',
        [req.user.id]
      );
      res.json({ success: true, users: rows });
    } catch (e) {
      console.error('users:', e);
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/volgodonsk/chat/info', async (req, res) => {
    try {
      const chatType = req.query.type === 'private' ? 'private' : 'general';
      const { rows } = await pool.query(
        'SELECT message_text, is_active FROM chat_info_messages WHERE chat_type = $1',
        [chatType]
      );
      if (rows.length === 0) return res.json({ success: true, message: null });
      res.json({ success: true, message: rows[0].is_active ? rows[0].message_text : null });
    } catch (e) {
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/volgodonsk/chat/history', authRequired, async (req, res) => {
    try {
      const limit = parseInt(getSetting('history_limit', 50));
      const { rows } = await pool.query(
        'SELECT m.id, m.user_id, m.text, m.image_url, m.created_at, m.admin_deleted, ' +
        'u.full_name, u.login FROM chat_messages m JOIN users u ON u.id = m.user_id ' +
        'WHERE m.is_deleted = false OR m.admin_deleted = true ' +
        'ORDER BY m.created_at DESC LIMIT $1',
        [limit]
      );
      res.json({ success: true, messages: rows.reverse() });
    } catch (e) {
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/volgodonsk/chat/private/:userId', authRequired, async (req, res) => {
    try {
      const otherId = req.params.userId;
      if (!UUID_RE.test(otherId)) return res.status(400).json({ error: 'Bad id' });
      const limit = parseInt(getSetting('history_limit', 50));
      const me = req.user.id;
      const { rows } = await pool.query(
        'SELECT pm.id, pm.sender_id as user_id, pm.text, pm.image_url, pm.created_at, ' +
        'pm.admin_deleted, u.full_name, u.login, pm.is_read ' +
        'FROM private_messages pm JOIN users u ON u.id = pm.sender_id ' +
        'WHERE ((pm.sender_id = $1 AND pm.receiver_id = $2) OR (pm.sender_id = $2 AND pm.receiver_id = $1)) ' +
        'AND (pm.is_deleted = false OR pm.admin_deleted = true) ' +
        'ORDER BY pm.created_at DESC LIMIT $3',
        [me, otherId, limit]
      );
      res.json({ success: true, messages: rows.reverse() });
    } catch (e) {
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.post('/api/volgodonsk/chat/send', authRequired, messageLimiter, upload.single('image'), async (req, res) => {
    try {
      const userId = req.user.id;
      const { text, receiverId } = req.body || {};
      const file = req.file;
      const isPrivate = !!receiverId;

      if (!text && !file) return res.status(400).json({ error: 'Сообщение пустое' });

      const maxLen = parseInt(getSetting('max_message_length', 2000));
      if (text && String(text).length > maxLen) {
        return res.status(400).json({ error: 'Сообщение слишком длинное (макс. ' + maxLen + ')' });
      }

      if (text && await containsBannedWords(text)) {
        return res.status(403).json({ error: 'Запрещённые слова' });
      }

      if (isPrivate) {
        if (!UUID_RE.test(receiverId)) return res.status(400).json({ error: 'Bad receiver' });
        const { rows } = await pool.query('SELECT id, is_banned FROM users WHERE id = $1', [receiverId]);
        if (rows.length === 0 || rows[0].is_banned) {
          return res.status(404).json({ error: 'Получатель недоступен' });
        }
      }

      const spam = await checkSpam(userId, isPrivate);
      if (spam.blocked) {
        return res.status(429).json({ error: 'Слишком много сообщений', remainingSeconds: spam.remainingSeconds });
      }

      let imageUrl = null;
      if (file) {
        const maxSize = (getSetting('max_file_size_mb', 1) || 1) * 1024 * 1024;
        if (file.size > maxSize) return res.status(400).json({ error: 'Файл слишком большой' });
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
          return res.status(400).json({ error: 'Только изображения' });
        }
        if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const fileName = 'msg_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex') + '.webp';
        await sharp(file.buffer)
          .resize({ width: parseInt(getSetting('image_resize_width', 800)), withoutEnlargement: true })
          .webp({ quality: parseInt(getSetting('image_quality', 80)) })
          .toFile(path.join(UPLOAD_DIR, fileName));
        imageUrl = '/api/volgodonsk/media/' + fileName;
      }

      let msg;
      if (isPrivate) {
        const ins = await pool.query(
          'INSERT INTO private_messages (sender_id, receiver_id, text, image_url, created_at, is_read, is_deleted, admin_deleted) ' +
          'VALUES ($1,$2,$3,$4, NOW(), false, false, false) RETURNING id',
          [userId, receiverId, String(text || ''), imageUrl]
        );
        const { rows } = await pool.query(
          'SELECT pm.id, pm.sender_id as user_id, pm.text, pm.image_url, pm.created_at, ' +
          'pm.admin_deleted, u.full_name, u.login FROM private_messages pm ' +
          'JOIN users u ON u.id = pm.sender_id WHERE pm.id = $1',
          [ins.rows[0].id]
        );
        msg = Object.assign({}, rows[0], { type: 'private', receiver_id: receiverId });
        io.to(userId).to(receiverId).emit('new_message', msg);
      } else {
        const ins = await pool.query(
          'INSERT INTO chat_messages (user_id, text, image_url, created_at, is_deleted, admin_deleted) ' +
          'VALUES ($1,$2,$3, NOW(), false, false) RETURNING id',
          [userId, String(text || ''), imageUrl]
        );
        const { rows } = await pool.query(
          'SELECT m.id, m.user_id, m.text, m.image_url, m.created_at, m.admin_deleted, ' +
          'u.full_name, u.login FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = $1',
          [ins.rows[0].id]
        );
        msg = Object.assign({}, rows[0], { type: 'general' });
        io.emit('new_message', msg);
      }

      res.status(201).json({ success: true, message: msg });
    } catch (e) {
      console.error('send:', e);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  app.delete('/api/volgodonsk/chat/message/:messageId', authRequired, async (req, res) => {
    try {
      const messageId = req.params.messageId;
      if (!UUID_RE.test(messageId)) return res.status(400).json({ error: 'Bad id' });
      const userId = req.user.id;
      const isAdmin = req.user.is_admin;

      let { rows: messages } = await pool.query('SELECT id, user_id FROM chat_messages WHERE id = $1', [messageId]);
      let tableName = 'chat_messages';
      if (messages.length === 0) {
        const { rows: pm } = await pool.query('SELECT id, sender_id as user_id FROM private_messages WHERE id = $1', [messageId]);
        messages = pm;
        tableName = 'private_messages';
      }
      if (messages.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });

      const message = messages[0];
      if (String(message.user_id) !== String(userId) && !isAdmin) {
        return res.status(403).json({ error: 'Нет прав' });
      }
      await pool.query('UPDATE ' + tableName + ' SET is_deleted = true WHERE id = $1', [messageId]);
      io.emit('message_deleted', { messageId });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Ошибка' });
    }
  });

  app.post('/api/volgodonsk/user/settings', authRequired, async (req, res) => {
    try {
      const { showPhone } = req.body || {};
      await pool.query('UPDATE users SET show_phone_in_private = $1 WHERE id = $2', [!!showPhone, req.user.id]);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/volgodonsk/user/note', authRequired, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT admin_note FROM users WHERE id = $1', [req.user.id]);
      res.json({ success: true, note: rows.length ? (rows[0].admin_note || '') : '' });
    } catch (e) {
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/volgodonsk/chat/unread-counts', authRequired, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT sender_id, COUNT(*)::int as count FROM private_messages ' +
        'WHERE receiver_id = $1 AND is_read = false GROUP BY sender_id',
        [req.user.id]
      );
      const counts = {};
      rows.forEach(r => { counts[String(r.sender_id)] = r.count; });
      res.json({ success: true, counts });
    } catch (e) {
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.post('/api/volgodonsk/chat/mark-read', authRequired, async (req, res) => {
    try {
      const { senderId } = req.body || {};
      if (!senderId || !UUID_RE.test(senderId)) return res.status(400).json({ error: 'Bad senderId' });
      const r = await pool.query(
        'UPDATE private_messages SET is_read = true WHERE receiver_id = $1 AND sender_id = $2 AND is_read = false',
        [req.user.id, senderId]
      );
      if (r.rowCount > 0) io.to(senderId).emit('messages_read', { readerId: req.user.id, senderId });
      res.json({ success: true, marked: r.rowCount });
    } catch (e) {
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.post('/api/volgodonsk/chat/report', authRequired, reportLimiter, async (req, res) => {
    try {
      const { messageId, reason, comment } = req.body || {};
      if (!messageId || !UUID_RE.test(messageId)) return res.status(400).json({ error: 'Bad messageId' });

      const { rows: cm } = await pool.query('SELECT user_id FROM chat_messages WHERE id = $1', [messageId]);
      let reportedUser = null;
      if (cm.length > 0) reportedUser = cm[0].user_id;
      else {
        const { rows: pm } = await pool.query('SELECT sender_id FROM private_messages WHERE id = $1', [messageId]);
        if (pm.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
        reportedUser = pm[0].sender_id;
      }

      await pool.query(
        'INSERT INTO chat_reports (reporter_id, reported_user_id, message_id, reason, comment, status, created_at) ' +
        "VALUES ($1, $2, $3, $4, $5, 'pending', NOW())",
        [req.user.id, reportedUser, messageId,
         String(reason || '').slice(0, 50), String(comment || '').slice(0, 1000)]
      );

      res.json({ success: true });
    } catch (e) {
      console.error('report:', e);
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });
};
