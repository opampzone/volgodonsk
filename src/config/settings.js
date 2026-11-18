// src/config/settings.js
const pool = require('./db');

const chatSettings = {
  spam_timeout: 3,
  spam_threshold: 5,
  spam_block_duration: 60,
  max_file_size_mb: 1,
  image_resize_width: 800,
  image_quality: 80,
  history_limit: 50,
  max_message_length: 2000,
  suspicious_threshold: 30,
  suspicious_timeframe: 60,
  maintenance_mode: false,
  registration_open: true,
  chat_title: 'Общий чат',
  chat_description: 'Чат проекта Электроника Волгодонска'
};

async function loadSettings() {
  try {
    const { rows } = await pool.query('SELECT setting_key, setting_value FROM chat_settings');
    rows.forEach(r => {
      let v = r.setting_value;
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      else if (!isNaN(v) && v !== '') v = Number(v);
      chatSettings[r.setting_key] = v;
    });
    console.log('✅ Настройки загружены из БД');
  } catch (e) {
    console.error('❌ Ошибка загрузки настроек:', e.message);
  }
}

function updateSetting(key, value) {
  let v = value;
  if (value === 'true') v = true;
  else if (value === 'false') v = false;
  else if (!isNaN(value) && value !== '') v = Number(value);
  chatSettings[key] = v;
}

const getSetting = (key, def) => chatSettings[key] !== undefined ? chatSettings[key] : def;
const getAllSettings = () => ({ ...chatSettings });

module.exports = { loadSettings, updateSetting, getSetting, getAllSettings };