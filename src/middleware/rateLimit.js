// src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Слишком много запросов. Попробуйте позже.' }
};

module.exports = {
  loginLimiter: rateLimit({ ...common, windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true }),
  registerLimiter: rateLimit({ ...common, windowMs: 60 * 60 * 1000, max: 5 }),
  passwordLimiter: rateLimit({ ...common, windowMs: 60 * 60 * 1000, max: 5 }),
  passwordResetLimiter: rateLimit({ ...common, windowMs: 15 * 60 * 1000, max: 10 }),
  messageLimiter: rateLimit({ ...common, windowMs: 60 * 1000, max: 60 }),
  reportLimiter: rateLimit({ ...common, windowMs: 60 * 60 * 1000, max: 20 }),
  apiLimiter: rateLimit({ ...common, windowMs: 60 * 1000, max: 300 })
};