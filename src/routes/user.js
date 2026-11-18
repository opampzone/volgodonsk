// src/routes/user.js
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');

// Функция для безопасного удаления HTML-тегов
function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>?/gm, '')  // Удаляем все HTML-теги
    .replace(/&nbsp;/g, ' ')    // Заменяем HTML-пробел на обычный пробел
    .replace(/&amp;/g, '&')     // Амперсанд оставляем как есть
    // &lt; и &gt; НЕ заменяем на < и >, чтобы не создать опасные символы
    .trim();
}

module.exports = function(app) {
  
  // === ПОЛУЧИТЬ интересы и предложения пользователя ===
  app.get('/api/volgodonsk/user/interests', authRequired, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT interests, suggestions FROM users WHERE id = $1',
        [req.user.id]
      );
      
      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
      }
      
      res.json({ 
        success: true, 
        data: {
          interests: rows[0].interests || '',
          suggestions: rows[0].suggestions || ''
        } 
      });
    } catch (e) {
      console.error('❌ Get interests:', e);
      res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
  });

  // === СОХРАНИТЬ интересы и предложения пользователя ===
  app.post('/api/volgodonsk/user/interests', authRequired, async (req, res) => {
    try {
      const { interests, suggestions } = req.body || {};

      // ПРАВИЛЬНЫЙ ПОРЯДОК:
      // 1. Обрезать с запасом (до 1000 и 4000 символов)
      // 2. Очистить от HTML
      // 3. Обрезать до финальной длины (500 и 2000)
      
      const cleanInterests = stripHtml(String(interests || '').slice(0, 1000)).slice(0, 500);
      const cleanSuggestions = stripHtml(String(suggestions || '').slice(0, 4000)).slice(0, 2000);

      await pool.query(
        'UPDATE users SET interests = $1, suggestions = $2 WHERE id = $3',
        [cleanInterests, cleanSuggestions, req.user.id]
      );

      res.json({ success: true, message: 'Данные успешно сохранены!' });
    } catch (e) {
      console.error('❌ Save interests:', e);
      res.status(500).json({ success: false, error: 'Ошибка сервера при сохранении' });
    }
  });
};