// src/routes/repairmen.js
const pool = require('../config/db');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shape(r) {
  return {
    id: r.id, full_name: r.full_name || r.login || 'Без имени',
    login: r.login, phone: r.phone || null, email: r.email || null,
    repairman_type: r.repairman_type || 'private', location: r.location || null,
    resume: r.resume || null,
    specializations: Array.isArray(r.specializations) ? r.specializations : [],
    roles: r.roles || [], created_at: r.created_at
  };
}

module.exports = function (app) {
  app.get('/api/volgodonsk/repairmen', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT id, full_name, login, phone, email, repairman_type, location, resume,
               specializations, roles, created_at
        FROM users
        WHERE is_banned = false AND repairman_type IS NOT NULL
        ORDER BY created_at DESC LIMIT 500
      `);
      const repairmen = rows.map(shape);
      res.json({ success: true, count: repairmen.length, repairmen });
    } catch (e) {
      console.error('repairmen:', e);
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });

  app.get('/api/volgodonsk/repairman/:id', async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ success: false, error: 'Bad id' });
      const { rows } = await pool.query(`
        SELECT id, full_name, login, phone, email, repairman_type, location, resume,
               specializations, roles, created_at
        FROM users WHERE id = $1 AND is_banned = false AND repairman_type IS NOT NULL
      `, [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ success: false, error: 'Не найден' });
      res.json({ success: true, repairman: shape(rows[0]) });
    } catch (e) {
      res.status(500).json({ success: false, error: 'Ошибка' });
    }
  });
};