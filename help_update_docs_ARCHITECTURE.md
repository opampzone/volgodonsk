Для вывода структуры проекта в терминале Ubuntu. 
bash-скрипт update_docs.sh, который автоматически собирает и обновляет файл ARCHITECTURE.md одной командой.



Команды обслуживания и эксплуатации

* **Обновить документацию:** `./update_docs.sh`
* **Статус и перезапуск бэкенда:** `pm2 status` / `pm2 restart ecosystem.config.js`
* **Просмотр логов:** `pm2 logs --lines 50`
* **Ручной запуск очистки файлов:** `node /var/www/volgodonsk/cleanup.js`
* **Резервная копия БД:** `pg_dump -U volg_user -h localhost volgodonsk > /root/backup_volgodonsk_$(date +%F).sql`
* **Проверка конфигурации Nginx:** `nginx -t && systemctl reload nginx`