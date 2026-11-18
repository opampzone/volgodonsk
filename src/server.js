// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const pool = require('./config/db');
const { loadSettings } = require('./config/settings');
const { SECRET, COOKIE_NAME } = require('./config/jwt');
const { authRequired } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
const server = http.createServer(app);

// ✅ КРИТИЧНО: без этого req.ip = 127.0.0.1 у всех, и:
//    - rate limit общий на всех пользователей
//    - geo/ip считает всех "local" и не зовёт Dadata
// Ставим ДО всех app.use() и роутов.
app.set('trust proxy', 1);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://elplus7.ru')
  .split(',').map(s => s.trim()).filter(Boolean);

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'], credentials: true }
});

const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'chat');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'same-site' }
}));

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Rate limit на весь API
app.use('/api/', apiLimiter);

// Блокируем прямую отдачу /uploads/
app.use('/uploads', (req, res) => res.status(404).end());

// Статика
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, p) => {
    if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Защищённая отдача изображений чата
app.get('/api/volgodonsk/media/:filename', authRequired, (req, res) => {
  const { filename } = req.params;
  if (filename.includes('/') || filename.includes('..') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Некорректное имя' });
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден' });
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(filePath);
});

// Совместимость со старыми URL
app.get('/uploads/chat/:filename', authRequired, (req, res) => {
  const { filename } = req.params;
  if (filename.includes('/') || filename.includes('..') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Некорректное имя' });
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден' });
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(filePath);
});

app.set('io', io);

// === Socket.IO с аутентификацией ===
const onlineUsers = new Map();

io.use(async (socket, next) => {
  try {
    let token = socket.handshake.auth?.token;
    if (!token) {
      const cookies = socket.handshake.headers.cookie || '';
      const m = cookies.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE_NAME + '='));
      if (m) token = decodeURIComponent(m.slice(COOKIE_NAME.length + 1));
    }
    if (!token) return next(new Error('no_token'));

    let payload;
    try { payload = jwt.verify(token, SECRET); }
    catch { return next(new Error('invalid_token')); }

    const { rows } = await pool.query('SELECT id, is_banned FROM users WHERE id = $1', [payload.sub]);
    if (rows.length === 0) return next(new Error('user_not_found'));
    if (rows[0].is_banned) return next(new Error('banned'));

    socket.userId = rows[0].id;
    next();
  } catch (e) {
    next(new Error('auth_error'));
  }
});

io.on('connection', (socket) => {
  const uid = socket.userId;
  socket.join(uid);

  if (!onlineUsers.has(uid)) onlineUsers.set(uid, new Set());
  onlineUsers.get(uid).add(socket.id);
  io.emit('users_online', Array.from(onlineUsers.keys()));

  socket.on('disconnect', () => {
    const set = onlineUsers.get(uid);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(uid);
        io.emit('users_online', Array.from(onlineUsers.keys()));
      }
    }
  });
});

// Тестовый эндпоинт
app.get('/api/test', async (req, res) => {
  try {
    const r = await pool.query('SELECT COUNT(*) FROM users');
    res.json({ success: true, message: 'OK', usersCount: r.rows[0].count });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Ошибка' });
  }
});

// Роуты
require('./routes/auth')(app);
require('./routes/components')(app);
require('./routes/password')(app);
require('./routes/chat')(app, io);
require('./routes/admin')(app, io);
require('./routes/repairmen')(app);
require('./routes/geo')(app);          // ← новый роут

loadSettings().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Сервер на порту ${PORT}`);
  });
});