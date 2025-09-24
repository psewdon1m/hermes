// services/api/src/app.js
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

import { callRouter } from './routes/call.js';
import { joinRouter } from './routes/join.js';
import { rateLimit, bruteCodeLimiter } from './lib/ratelimit.js';

export function createApp() {
  const app = express();

  // Консервативный CORS: разрешаем только продовый фронтенд
  const ALLOW_ORIGIN = ['https://call.tgcall.us'];
  app.use(cors({ origin: ALLOW_ORIGIN, credentials: false }));

  // Подключаем JSON body parser и логирование запросов
  app.use(express.json({ limit: '100kb' }));
  app.use(morgan('tiny'));

  // Health
  app.get('/healthz', (_req, res) => res.send('ok'));      // внутренний health-check
  app.get('/api/healthz', (_req, res) => res.send('ok'));  // проверка доступности со стороны Caddy

  // --- Базовый per-IP rate limit: 60 запросов за 60 секунд
  app.use(rateLimit({
    windowSec: 60,
    limit: 60,
    keyFn: (req) => {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
        .toString()
        .split(',')[0]
        .trim();
      return `rl:ip:${ip}:g60`;
    }
  }));

  // --- Дополнительный анти-брутфорс лимитер для /api/call/resolve
  app.use('/api/call/resolve', bruteCodeLimiter({
    ipLimit: 40,
    codeLimit: 25,
    windowSec: 300
  }));

  // Маршруты API
  app.use('/api/call', callRouter);
  app.use('/api/join', joinRouter);

  // Финальный обработчик ошибок (в продакшене не раскрываем детали)
  app.use((err, req, res, _next) => {
    console.error('ERR', { path: req.path, msg: err?.message });
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

