// src/config/jwt.js
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error('JWT_SECRET отсутствует или слишком короткий (мин. 32 символа)');
}

module.exports = {
  SECRET: secret,
  EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  COOKIE_NAME: 'volg_token'
};