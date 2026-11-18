// src/routes/components.js
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = function registerComponentRoutes(app) {

  // ============================================================
  // 1. Загрузка компонентов из Excel (полная замена склада)
  // ============================================================
  app.post('/api/volgodonsk/components/upload', authRequired, async (req, res) => {
    const client = await pool.connect();
    try {
      const { items } = req.body || {};
      const userId = req.user.id;

      if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, error: 'Некорректные данные' });
      }
      if (items.length > 5000) {
        return res.status(400).json({ success: false, error: 'Максимум 5000 позиций за один раз' });
      }

      const userRes = await client.query(
        'SELECT full_name, location, phone FROM users WHERE id = $1',
        [userId]
      );
      if (userRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
      }
      const userData = userRes.rows[0];

      await client.query('BEGIN');
      await client.query('DELETE FROM components WHERE user_id = $1', [userId]);

      const CHUNK_SIZE = 1000;
      for (let start = 0; start < items.length; start += CHUNK_SIZE) {
        const chunk = items.slice(start, start + CHUNK_SIZE);
        const values = [];
        const placeholders = [];

        chunk.forEach((item, index) => {
          const o = index * 10;
          placeholders.push(
            `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10}, NOW(), NOW())`
          );
          values.push(
            userId,
            String(item.name || '').slice(0, 255),
            String(item.category || '').slice(0, 100),
            Math.max(0, parseInt(item.qty) || 0),
            Math.max(0, parseInt(item.price) || 0),
            String(item.condition || '').slice(0, 100),
            String(item.description || '').slice(0, 5000),
            userData.full_name,
            userData.location,
            userData.phone || 'Не указан'
          );
        });

        await client.query(
          `INSERT INTO components
             (user_id, name, category, qty, price, condition, description,
              owner_name, city, contact, created_at, updated_at)
           VALUES ${placeholders.join(', ')}`,
          values
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, count: items.length, message: 'Товары успешно обновлены' });

    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('❌ upload components:', error);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    } finally {
      client.release();
    }
  });


  // ============================================================
  // 2. Поиск компонентов (закрытый клуб)
  // ============================================================
  app.get('/api/volgodonsk/components/search', authRequired, async (req, res) => {
    try {
      const { name, category } = req.query;

      let query = 'SELECT * FROM components WHERE 1=1';
      const values = [];
      let i = 1;

      if (name) {
        query += ` AND name ILIKE $${i++}`;
        values.push(`%${String(name).slice(0, 100)}%`);
      }
      if (category) {
        query += ` AND category = $${i++}`;
        values.push(String(category).slice(0, 100));
      }

      query += ' ORDER BY updated_at DESC NULLS LAST LIMIT 500';

      const result = await pool.query(query, values);
      res.json({ success: true, count: result.rows.length, items: result.rows });

    } catch (error) {
      console.error('❌ search components:', error);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });

  // ============================================================
  // 3. Удаление: выбранных (ids) или всех (deleteAll:true)
  // ============================================================
  app.post('/api/volgodonsk/components/delete', authRequired, async (req, res) => {
    try {
      const { ids, deleteAll } = req.body || {};

      if (deleteAll === true) {
        const r = await pool.query(
          'DELETE FROM components WHERE user_id = $1 RETURNING id',
          [req.user.id]
        );
        return res.json({ success: true, count: r.rowCount });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'Не указаны ID для удаления' });
      }

      const validIds = ids.filter(id => typeof id === 'string' && UUID_RE.test(id));
      if (validIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Некорректные ID' });
      }

      const r = await pool.query(
        'DELETE FROM components WHERE user_id = $1 AND id = ANY($2::uuid[]) RETURNING id',
        [req.user.id, validIds]
      );
      res.json({ success: true, count: r.rowCount });

    } catch (e) {
      console.error('❌ components delete:', e);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });

  // ============================================================
  // 4. Получение компонентов пользователя (свой профиль или админ)
  // ============================================================
  app.get('/api/volgodonsk/components/user/:userId', authRequired, async (req, res) => {
    try {
      const { userId } = req.params;

      if (!UUID_RE.test(userId)) {
        return res.status(400).json({ success: false, error: 'Некорректный ID' });
      }

      // Только свои компоненты или админ может смотреть чужие
      if (userId !== req.user.id && !req.user.is_admin) {
        return res.status(403).json({ success: false, error: 'Доступ запрещён' });
      }

      const result = await pool.query(
        'SELECT * FROM components WHERE user_id = $1 ORDER BY name ASC',
        [userId]
      );

      res.json({ success: true, count: result.rows.length, items: result.rows });

    } catch (error) {
      console.error('❌ get user components:', error);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });

  // ============================================================
  // 5. Пакетное обновление компонентов
  // ============================================================
  app.put('/api/volgodonsk/components/update', authRequired, async (req, res) => {
    const client = await pool.connect();
    try {
      const { items } = req.body || {};
      const userId = req.user.id;

      if (!Array.isArray(items) || items.length > 1000) {
        return res.status(400).json({ success: false, error: 'Некорректные данные' });
      }

      await client.query('BEGIN');

      for (const item of items) {
        if (!item || !UUID_RE.test(item.id)) continue;
        await client.query(
          `UPDATE components
             SET name = $1, category = $2, qty = $3, price = $4,
                 condition = $5, description = $6, updated_at = NOW()
           WHERE id = $7 AND user_id = $8`,
          [
            String(item.name || '').slice(0, 255),
            String(item.category || '').slice(0, 100),
            Math.max(0, parseInt(item.qty) || 0),
            Math.max(0, parseInt(item.price) || 0),
            String(item.condition || '').slice(0, 100),
            String(item.description || '').slice(0, 5000),
            item.id,
            userId
          ]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, message: '✅ Изменения успешно сохранены' });

    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('❌ update components:', error);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    } finally {
      client.release();
    }
  });
};