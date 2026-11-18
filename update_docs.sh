#!/bin/bash
set -e

PROJECT_DIR="/var/www/volgodonsk"
OUT_FILE="$PROJECT_DIR/ARCHITECTURE.md"
CURRENT_DATE=$(date +"%Y-%m-%d %H:%M")

cd "$PROJECT_DIR"

cat << EOF > "$OUT_FILE"
# Техническая документация проекта «Электроника Волгодонска»

**URL:** https://elplus7.ru  
**Локальная директория:** \`$PROJECT_DIR\`  
**Автоматически обновлено:** $CURRENT_DATE

---

## 1. Инфраструктура и стек технологий

* **Сервер:** VPS Ubuntu 24.04 LTS (1 vCPU, 2 ГБ RAM, локация: РФ, 152-ФЗ).
* **Панель управления:** ISPmanager.
* **Веб-сервер:** Nginx 1.24 (SSL Let's Encrypt, статика из \`public/\`, проксирование \`/api/\` и \`/socket.io/\` на порт \`3001\`).
* **Backend:** Node.js + Express (\`src/server.js\`), управление процессами через **PM2** (\`ecosystem.config.js\`).
* **База данных:** PostgreSQL 16 (БД: \`volgodonsk\`, пользователь: \`volg_user\`).
* **Real-time:** Socket.IO 4.7.2.
* **Обработка файлов и медиа:** \`Multer\` (загрузка), \`Sharp\` (сжатие в WebP), \`SheetJS\` (таблицы).
* **Почтовый сервис:** \`Nodemailer\` через SMTP Яндекс.Почты (\`elplus7.notification@yandex.ru\`).
* **Frontend:** Vanilla HTML5, CSS3, ES6+ JavaScript, PWA (\`manifest.json\`, \`sw.js\`).

---

## 2. Структура директорий и файлов

\`\`\`text
EOF

find . -maxdepth 3 -not -path "*/.*" -not -path "./node_modules*" -not -path "./public/uploads/*" | sort >> "$OUT_FILE"

cat << 'EOF' >> "$OUT_FILE"
```

---

## 3. Схема базы данных PostgreSQL (`volgodonsk`)

```text
EOF

sudo -u postgres psql -d volgodonsk -P pager=off -c "\dt public.*" -c "\d public.*" >> "$OUT_FILE"

cat << 'EOF' >> "$OUT_FILE"
```

---

## 4. Карта REST API эндпоинтов (`src/`)

```text
EOF

grep -rnE "app\.(get|post|put|delete|patch)|router\.(get|post|put|delete|patch)" src/ | sed "s/:[[:space:]]*/ -> /" >> "$OUT_FILE"

cat << 'EOF' >> "$OUT_FILE"
```

---

## 5. Карта событий Socket.IO (`src/` и `public/chat_js/`)

```text
EOF

grep -rnE "io\.(emit|to)|socket\.(on|emit)" src/ public/chat_js/ | sed "s/:[[:space:]]*/ -> /" >> "$OUT_FILE"

cat << 'EOF' >> "$OUT_FILE"
```

---

## 6. Команды обслуживания и эксплуатации

* **Обновить документацию:** `./update_docs.sh`
* **Статус и перезапуск бэкенда:** `pm2 status` / `pm2 restart ecosystem.config.js`
* **Просмотр логов:** `pm2 logs --lines 50`
* **Ручной запуск очистки файлов:** `node /var/www/volgodonsk/cleanup.js`
* **Резервная копия БД:** `pg_dump -U volg_user -h localhost volgodonsk > /root/backup_volgodonsk_$(date +%F).sql`
* **Проверка конфигурации Nginx:** `nginx -t && systemctl reload nginx`
EOF

echo "✅ ARCHITECTURE.md обновлён ($(wc -l < "$OUT_FILE") строк)"
