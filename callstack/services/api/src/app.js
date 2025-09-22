// services/api/src/app.js
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

import { callRouter } from './routes/call.js';
import { joinRouter } from './routes/join.js';
import { rateLimit, bruteCodeLimiter } from './lib/ratelimit.js';

export function createApp() {
  const app = express();

  // Ограниченный CORS: только наш домен
  const ALLOW_ORIGIN = ['https://call.tgcall.space'];
  app.use(cors({ origin: ALLOW_ORIGIN, credentials: false }));

  // Базовые миддлвары
  app.use(express.json({ limit: '100kb' }));
  app.use(morgan('tiny'));

  // Health
  app.get('/healthz', (_req, res) => res.send('ok'));      // локально
  app.get('/api/healthz', (_req, res) => res.send('ok'));  // через Caddy

  // --- Глобальный per-IP лимит: 60 req / 60 сек
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

  // --- Анти-брут кода для /api/call/resolve
  app.use('/api/call/resolve', bruteCodeLimiter({
    ipLimit: 40,
    codeLimit: 25,
    windowSec: 300
  }));

  // Маршруты API
  app.use('/api/call', callRouter);
  app.use('/api/join', joinRouter);

  // Обработчик ошибок (без чувствительных данных)
  app.use((err, req, res, _next) => {
    console.error('ERR', { path: req.path, msg: err?.message });
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
