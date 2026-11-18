require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const dbPassword = process.env.DB_PASSWORD || process.env.DB_PASS;
if (!dbPassword) {
  console.error('❌ Пароль БД не найден (DB_PASS/DB_PASSWORD в .env)');
  process.exit(1);
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: dbPassword,
  port: parseInt(process.env.DB_PORT) || 5432
});

const UPLOAD_DIR = path.join(__dirname, 'uploads', 'chat');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = q => new Promise(r => rl.question(q, r));

async function showStats() {
  console.log('\n📊 === СТАТИСТИКА ===');
  const dbSize = await pool.query("SELECT pg_size_pretty(pg_database_size(current_database())) as size");
  console.log(`💾 БД: ${dbSize.rows[0].size}`);

  const { rows: sizes } = await pool.query(`
    SELECT relname as table, pg_size_pretty(pg_total_relation_size(relid)) as size
    FROM pg_catalog.pg_statio_user_tables
    ORDER BY pg_total_relation_size(relid) DESC LIMIT 5
  `);
  sizes.forEach(r => console.log(`   - ${r.table}: ${r.size}`));

  const { rows: cnt } = await pool.query(`
    SELECT (SELECT COUNT(*) FROM users) users,
           (SELECT COUNT(*) FROM chat_messages) cm,
           (SELECT COUNT(*) FROM private_messages) pm,
           (SELECT COUNT(*) FROM chat_reports) rep
  `);
  console.log(`👥 Пользователей: ${cnt[0].users}, 💬 общий: ${cnt[0].cm}, 🔒 личных: ${cnt[0].pm}, ⚠️ жалоб: ${cnt[0].rep}`);

  let size = 0, files = 0;
  if (fs.existsSync(UPLOAD_DIR)) {
    for (const f of fs.readdirSync(UPLOAD_DIR)) { files++; size += fs.statSync(path.join(UPLOAD_DIR, f)).size; }
  }
  console.log(`🖼️ Файлов: ${files} (${(size / (1024 * 1024)).toFixed(2)} MB)`);
}

async function cleanOrphanedImages() {
  if (!fs.existsSync(UPLOAD_DIR)) return console.log('⚠️ Папки uploads нет');
  const { rows } = await pool.query(`
    SELECT image_url FROM chat_messages WHERE image_url IS NOT NULL AND image_url != '' AND is_deleted = false
    UNION
    SELECT image_url FROM private_messages WHERE image_url IS NOT NULL AND image_url != '' AND is_deleted = false
  `);
  const active = new Set(rows.map(r => r.image_url.split('/').pop().trim()).filter(Boolean));
  let deleted = 0;
  for (const f of fs.readdirSync(UPLOAD_DIR)) {
    if (!active.has(f)) { fs.unlinkSync(path.join(UPLOAD_DIR, f)); deleted++; }
  }
  console.log(`✅ Удалено: ${deleted}`);
}

async function cleanSoftDeleted() {
  const c = await pool.query('DELETE FROM chat_messages WHERE is_deleted = true');
  const p = await pool.query('DELETE FROM private_messages WHERE is_deleted = true');
  console.log(`✅ Общий: ${c.rowCount}, Личный: ${p.rowCount}`);
}

async function cleanOldMessages() {
  const days = parseInt(await question('Сколько дней хранить? '));
  if (!days || days <= 0) return console.log('❌ Неверное число');
  const ok = (await question(`Удалить сообщения старше ${days} дней? (да/нет): `)).toLowerCase();
  if (!['да','y','yes'].includes(ok)) return console.log('Отменено');
  const c = await pool.query(`DELETE FROM chat_messages WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(days)]);
  const p = await pool.query(`DELETE FROM private_messages WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(days)]);
  const r = await pool.query(`DELETE FROM chat_reports WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(days)]);
  console.log(`✅ Общий: ${c.rowCount}, Личный: ${p.rowCount}, Жалоб: ${r.rowCount}`);
}

async function vacuumDb() {
  console.log('⚙️ VACUUM ANALYZE...');
  await pool.query('VACUUM ANALYZE');
  console.log('✅ Готово');
}

async function main() {
  while (true) {
    console.log('\n1.Статистика  2.Осиротевшие файлы  3.Мягко удалённые  4.Старые сообщения  5.VACUUM  0.Выход');
    const c = (await question('Выбор: ')).trim();
    try {
      if (c === '1') await showStats();
      else if (c === '2') await cleanOrphanedImages();
      else if (c === '3') await cleanSoftDeleted();
      else if (c === '4') await cleanOldMessages();
      else if (c === '5') await vacuumDb();
      else if (c === '0') { await pool.end(); rl.close(); process.exit(0); }
    } catch (e) { console.error('❌', e.message); }
    await question('Enter...');
    console.clear();
  }
}

main().catch(e => { console.error(e); process.exit(1); });