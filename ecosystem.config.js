module.exports = {
  apps: [
    {
      name: 'volgodonsk-api',
      script: './src/server.js',
      
      // 🔑 САМОЕ ВАЖНОЕ: жестко указываем рабочую папку. 
      // Теперь PM2 всегда будет находить файл .env, откуда бы вы его ни запускали.
      cwd: '/var/www/volgodonsk',
      
      // Автоматический перезапуск при падении
      autorestart: true,
      
      // Количество экземпляров (для Node.js с Socket.IO пока лучше оставить 1)
      instances: 1,
      exec_mode: 'fork',
      
      // Логи (опционально, но полезно)
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Переменные окружения по умолчанию
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};