// src/routes/admin.js
const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const { updateSetting } = require('../config/settings');
const { authRequired, adminRequired } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/chat');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = function (app, io) {
  const admin = [authRequired, adminRequired];

  // === ЖАЛОБЫ ===
  app.get('/api/volgodonsk/admin/reports', admin, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT r.id, r.reporter_id, r.reported_user_id, r.message_id, r.reason, r.comment,
               r.status, r.created_at,
               u1.full_name as reporter_name, u2.full_name as reported_name,
               COALESCE(cm.text, pm.text) as message_text,
               COALESCE(cm.image_url, pm.image_url) as message_image
        FROM chat_reports r
        LEFT JOIN users u1 ON u1.id = r.reporter_id
        LEFT JOIN users u2 ON u2.id = r.reported_user_id
        LEFT JOIN chat_messages cm ON cm.id = r.message_id
        LEFT JOIN private_messages pm ON pm.id = r.message_id
        ORDER BY r.created_at DESC LIMIT 500
      `);
      res.json({ success: true, reports: rows });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/reports/:id/status', admin, async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
      const allowed = ['pending', 'new', 'reviewed', 'resolved', 'rejected'];
      if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Некорректный статус' });
      await pool.query('UPDATE chat_reports SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/reports/:id/delete-message', admin, async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
      const { rows } = await pool.query('SELECT message_id FROM chat_reports WHERE id = $1', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Жалоба не найдена' });
      const messageId = rows[0].message_id;
      if (!messageId) return res.status(400).json({ error: 'Нет сообщения' });

      let { rows: msgs } = await pool.query('SELECT id FROM chat_messages WHERE id = $1', [messageId]);
      let table = 'chat_messages';
      if (msgs.length === 0) {
        const { rows: pm } = await pool.query('SELECT id FROM private_messages WHERE id = $1', [messageId]);
        msgs = pm; table = 'private_messages';
      }
      if (msgs.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });

      await pool.query(
        `UPDATE ${table} SET is_deleted = true, admin_deleted = true, text = 'Удалено по обращению', image_url = NULL WHERE id = $1`,
        [messageId]
      );
      io.emit('message_admin_deleted', { messageId });
      await pool.query('UPDATE chat_reports SET status = $1 WHERE id = $2', ['reviewed', req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/reports/:id/ban-user', admin, async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
      const { rows } = await pool.query('SELECT reported_user_id FROM chat_reports WHERE id = $1', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Жалоба не найдена' });
      if (!rows[0].reported_user_id) return res.status(400).json({ error: 'Нарушитель не определён' });
      await pool.query('UPDATE users SET is_banned = true WHERE id = $1', [rows[0].reported_user_id]);
      await pool.query('UPDATE chat_reports SET status = $1 WHERE id = $2', ['reviewed', req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.delete('/api/volgodonsk/admin/reports/:id', admin, async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
      const { rows } = await pool.query('SELECT status FROM chat_reports WHERE id = $1', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Жалоба не найдена' });
      if (['new', 'pending'].includes(rows[0].status)) {
        return res.status(400).json({ error: 'Нельзя удалить нерешённую жалобу' });
      }
      await pool.query('DELETE FROM chat_reports WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  // === ИНФО-СООБЩЕНИЯ ===
  app.get('/api/volgodonsk/admin/info-messages', admin, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT id, chat_type, message_text, is_active, updated_at FROM chat_info_messages ORDER BY chat_type');
      res.json({ success: true, messages: rows });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/info-messages', admin, async (req, res) => {
    try {
      const { chatType, messageText, isActive } = req.body || {};
      if (!['general', 'private'].includes(chatType)) return res.status(400).json({ error: 'Неверный тип' });
      await pool.query(`
        INSERT INTO chat_info_messages (chat_type, message_text, is_active, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (chat_type) DO UPDATE SET message_text = $2, is_active = $3, updated_at = NOW()
      `, [chatType, String(messageText || '').slice(0, 5000), isActive !== false]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  // === BANNED WORDS ===
  app.get('/api/volgodonsk/admin/banned-words', admin, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT id, word FROM banned_words ORDER BY word ASC');
      res.json({ success: true, words: rows });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/banned-words', admin, async (req, res) => {
    try {
      const w = String(req.body.word || '').trim().toLowerCase();
      if (!w || w.length > 50) return res.status(400).json({ error: 'Некорректное слово' });
      await pool.query('INSERT INTO banned_words (word) VALUES ($1) ON CONFLICT DO NOTHING', [w]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.delete('/api/volgodonsk/admin/banned-words/:id', admin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
      await pool.query('DELETE FROM banned_words WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  // === USERS ===
  app.get('/api/volgodonsk/admin/users', admin, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT id, login, full_name, email, phone, is_admin, is_banned, created_at, admin_note
        FROM users ORDER BY created_at DESC LIMIT 1000
      `);
      res.json({ success: true, users: rows });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/users/:id/ban', admin, async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
      if (req.params.id === req.user.id) return res.status(400).json({ error: 'Нельзя забанить себя' });
      await pool.query('UPDATE users SET is_banned = true WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/users/:id/unban', admin, async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
      await pool.query('UPDATE users SET is_banned = false WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/users/:id/note', admin, async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
      const note = String(req.body.note || '').slice(0, 5000);
      await pool.query('UPDATE users SET admin_note = $1 WHERE id = $2', [note, req.params.id]);
      io.to(req.params.id).emit('admin_note_updated', { userId: req.params.id });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  // === PRIVATE CHATS ===
  app.get('/api/volgodonsk/admin/users/:id/private-chats', admin, async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
      const { rows } = await pool.query(`
        SELECT CASE WHEN pm.sender_id = $1 THEN pm.receiver_id ELSE pm.sender_id END as partner_id,
               u.full_name as partner_name, u.login as partner_login,
               COUNT(*)::int as message_count, MAX(pm.created_at) as last_message_at
        FROM private_messages pm
        JOIN users u ON u.id = CASE WHEN pm.sender_id = $1 THEN pm.receiver_id ELSE pm.sender_id END
        WHERE pm.sender_id = $1 OR pm.receiver_id = $1
        GROUP BY partner_id, partner_name, partner_login
        ORDER BY last_message_at DESC LIMIT 200
      `, [req.params.id]);
      res.json({ success: true, chats: rows });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.get('/api/volgodonsk/admin/private-chat/:userId1/:userId2', admin, async (req, res) => {
    try {
      const { userId1, userId2 } = req.params;
      if (!UUID_RE.test(userId1) || !UUID_RE.test(userId2)) return res.status(400).json({ error: 'Bad id' });

      await pool.query(
        'INSERT INTO admin_chat_access (admin_id, user_id, reason, accessed_at) VALUES ($1, $2, $3, NOW())',
        [req.user.id, userId1, `Просмотр диалога ${userId1} <-> ${userId2}`]
      );

      const { rows } = await pool.query(`
        SELECT pm.id, pm.sender_id, pm.receiver_id, pm.text, pm.image_url,
               pm.created_at, pm.is_read, pm.is_deleted, pm.admin_deleted,
               u.full_name as sender_name, u.login as sender_login
        FROM private_messages pm JOIN users u ON u.id = pm.sender_id
        WHERE ((pm.sender_id = $1 AND pm.receiver_id = $2) OR (pm.sender_id = $2 AND pm.receiver_id = $1))
        ORDER BY pm.created_at ASC LIMIT 500
      `, [userId1, userId2]);
      res.json({ success: true, messages: rows });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/delete-chat/:userId1/:userId2', admin, async (req, res) => {
    try {
      const { userId1, userId2 } = req.params;
      if (!UUID_RE.test(userId1) || !UUID_RE.test(userId2)) return res.status(400).json({ error: 'Bad id' });
      const r = await pool.query(`
        DELETE FROM private_messages
        WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
      `, [userId1, userId2]);
      res.json({ success: true, deleted: r.rowCount });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  // === SETTINGS ===
  app.get('/api/volgodonsk/admin/settings', admin, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT setting_key, setting_value, description FROM chat_settings ORDER BY setting_key');
      const settings = {};
      rows.forEach(r => { settings[r.setting_key] = { value: r.setting_value, description: r.description }; });
      res.json({ success: true, settings });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  const NUMERIC = new Set(['spam_timeout','spam_threshold','spam_block_duration','max_file_size_mb','image_resize_width','image_quality','history_limit','max_message_length','suspicious_threshold','suspicious_timeframe']);
  const BOOL = new Set(['maintenance_mode','registration_open']);

  app.post('/api/volgodonsk/admin/settings', admin, async (req, res) => {
    try {
      const { key, value } = req.body || {};
      if (!key || typeof key !== 'string' || !/^[a-z_]{3,50}$/.test(key)) {
        return res.status(400).json({ error: 'Некорректный ключ' });
      }

      let strValue;
      if (NUMERIC.has(key)) {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > 1e9) return res.status(400).json({ error: 'Некорректное число' });
        strValue = String(Math.floor(n));
      } else if (BOOL.has(key)) {
        strValue = (value === true || value === 'true') ? 'true' : 'false';
      } else {
        strValue = String(value).slice(0, 2000);
      }

      await pool.query(`
        INSERT INTO chat_settings (setting_key, setting_value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = NOW()
      `, [key, strValue]);
      updateSetting(key, strValue);
      io.emit('settings_updated', { key, value: strValue });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  // === SUSPICIOUS ===
  app.get('/api/volgodonsk/admin/suspicious-users', admin, async (req, res) => {
    try {
      const { rows: sr } = await pool.query(`
        SELECT setting_key, setting_value FROM chat_settings
        WHERE setting_key IN ('suspicious_threshold','suspicious_timeframe')
      `);
      const s = {};
      sr.forEach(r => { s[r.setting_key] = r.setting_value; });
      const threshold = Math.max(1, parseInt(s.suspicious_threshold || 30));
      const timeframe = Math.max(1, parseInt(s.suspicious_timeframe || 60));

      const { rows: priv } = await pool.query(`
        SELECT u.id, u.login, u.full_name, u.is_banned, COUNT(pm.id)::int as private_count
        FROM users u JOIN private_messages pm ON (pm.sender_id = u.id OR pm.receiver_id = u.id)
        WHERE pm.created_at > NOW() - ($1 || ' minutes')::interval
        GROUP BY u.id, u.login, u.full_name, u.is_banned
      `, [String(timeframe)]);

      const { rows: chat } = await pool.query(`
        SELECT u.id, u.login, u.full_name, u.is_banned, COUNT(cm.id)::int as chat_count
        FROM users u JOIN chat_messages cm ON cm.user_id = u.id
        WHERE cm.created_at > NOW() - ($1 || ' minutes')::interval
        GROUP BY u.id, u.login, u.full_name, u.is_banned
      `, [String(timeframe)]);

      const map = {};
      priv.forEach(r => { map[r.id] = { ...r, chat_count: 0, total: r.private_count }; });
      chat.forEach(r => {
        if (map[r.id]) { map[r.id].chat_count = r.chat_count; map[r.id].total += r.chat_count; }
        else { map[r.id] = { ...r, private_count: 0, total: r.chat_count }; }
      });
      const suspicious = Object.values(map).filter(u => u.total > threshold).sort((a, b) => b.total - a.total);
      res.json({ success: true, users: suspicious, threshold, timeframe });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  // === CLEANUP ===
  app.get('/api/volgodonsk/admin/cleanup/stats', admin, async (req, res) => {
    try {
      const dbSize = await pool.query("SELECT pg_size_pretty(pg_database_size(current_database())) as size");
      const tableSizes = await pool.query(`
        SELECT relname as table, pg_size_pretty(pg_total_relation_size(relid)) as size
        FROM pg_catalog.pg_statio_user_tables
        ORDER BY pg_total_relation_size(relid) DESC LIMIT 20
      `);
      const counts = await pool.query(`SELECT
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM chat_messages) as chat_msgs,
        (SELECT COUNT(*) FROM private_messages) as private_msgs,
        (SELECT COUNT(*) FROM chat_reports) as reports,
        (SELECT COUNT(*) FROM banned_words) as banned_words,
        (SELECT COUNT(*) FROM chat_messages WHERE is_deleted = true) as soft_deleted_chat,
        (SELECT COUNT(*) FROM private_messages WHERE is_deleted = true) as soft_deleted_private`);

      let diskSize = 0, fileCount = 0;
      if (fs.existsSync(UPLOAD_DIR)) {
        const files = fs.readdirSync(UPLOAD_DIR);
        fileCount = files.length;
        for (const f of files) diskSize += fs.statSync(path.join(UPLOAD_DIR, f)).size;
      }

      res.json({
        success: true,
        dbSize: dbSize.rows[0].size,
        tables: tableSizes.rows,
        counts: counts.rows[0],
        uploads: { files: fileCount, sizeMB: (diskSize / (1024 * 1024)).toFixed(2) }
      });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/cleanup/orphaned-images', admin, async (req, res) => {
    try {
      if (!fs.existsSync(UPLOAD_DIR)) return res.json({ success: true, deleted: 0 });
      const activeImagesRes = await pool.query(`
        SELECT image_url FROM chat_messages WHERE image_url IS NOT NULL AND image_url != '' AND is_deleted = false
        UNION
        SELECT image_url FROM private_messages WHERE image_url IS NOT NULL AND image_url != '' AND is_deleted = false
      `);
      const activeFileNames = new Set(
        activeImagesRes.rows.map(r => r.image_url.split('/').pop().trim()).filter(Boolean)
      );
      let deleted = 0;
      for (const file of fs.readdirSync(UPLOAD_DIR)) {
        if (!activeFileNames.has(file)) { fs.unlinkSync(path.join(UPLOAD_DIR, file)); deleted++; }
      }
      res.json({ success: true, deleted });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/cleanup/soft-deleted', admin, async (req, res) => {
    try {
      const c = await pool.query('DELETE FROM chat_messages WHERE is_deleted = true');
      const p = await pool.query('DELETE FROM private_messages WHERE is_deleted = true');
      res.json({ success: true, chat: c.rowCount, private: p.rowCount });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/cleanup/old-messages', admin, async (req, res) => {
    try {
      const days = parseInt(req.body.days);
      if (!Number.isFinite(days) || days <= 0 || days > 10000) return res.status(400).json({ error: 'Неверное количество дней' });
      const c = await pool.query(`DELETE FROM chat_messages WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(days)]);
      const p = await pool.query(`DELETE FROM private_messages WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(days)]);
      const r = await pool.query(`DELETE FROM chat_reports WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(days)]);
      res.json({ success: true, chat: c.rowCount, private: p.rowCount, reports: r.rowCount });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });

  app.post('/api/volgodonsk/admin/cleanup/vacuum', admin, async (req, res) => {
    try {
      await pool.query('VACUUM ANALYZE');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Ошибка' }); }
  });
};