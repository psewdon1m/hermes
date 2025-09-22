// services/api/src/lib/ratelimit.js
import { redis } from '../lib/redis.js';

export function rateLimit({ windowSec, limit, keyFn, onBlocked }) {
  return async (req, res, next) => {
    try {
      const key = keyFn(req);
      const ttl = windowSec;
      const now = Math.floor(Date.now() / 1000);

      const count = await redis.multi()
        .incr(key)
        .expire(key, ttl, 'NX')
        .exec()
        .then(resps => resps?.[0]?.[1] ?? 0);

      if (count > limit) {
        onBlocked?.(req, { key, limit, windowSec, now, count });
        res.set('Retry-After', String(windowSec));
        return res.status(429).json({ error: 'too_many_requests' });
      }
      return next();
    } catch (e) {
      // не блокируем при сбое Redis — пропускаем
      return next();
    }
  };
}

// Специальный лимитер «анти-брут кода»: вешаем и на IP, и на сам код
export function bruteCodeLimiter({ ipLimit = 30, codeLimit = 20, windowSec = 300 }) {
    return async (req, res, next) => {
      try {
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
        const code = (req.body?.code || '').toString().toUpperCase();
        if (!code) return next(); // валидация пусть отработает отдельно
  
        const h = await import('node:crypto');
        const codeHash = h.createHash('sha256').update(code).digest('hex').slice(0, 16);
  
        const ipKey   = `rl:ip:${ip}:resolve`;
        const codeKey = `rl:code:${codeHash}`;
  
        const resp = await redis.multi()
          .incr(ipKey)   .expire(ipKey, windowSec, 'NX')
          .incr(codeKey) .expire(codeKey, windowSec, 'NX')
          .exec();
  
        const ipCount   = resp?.[0]?.[1] ?? 0;
        const codeCount = resp?.[2]?.[1] ?? 0;
  
        if (ipCount > ipLimit || codeCount > codeLimit) {
          res.set('Retry-After', String(windowSec));
          return res.status(429).json({ error: 'too_many_requests' });
        }
        return next();
      } catch {
        return next();
      }
    };
  }