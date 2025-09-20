import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { callRouter } from './routes/call.js';
import { joinRouter } from './routes/join.js';

export function createApp() {
  const app = express();

  // CORS настройки
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    process.env.DOMAIN ? `https://${process.env.DOMAIN}` : 'https://tgcall.us'
  ];
  
  app.use(cors({ 
    origin: allowedOrigins, 
    credentials: false 
  }));

  // Базовые миддлвары
  app.use(express.json({ limit: '100kb' }));
  app.use(morgan('tiny'));

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // API маршруты
  app.use('/api/call', callRouter);
  app.use('/api/join', joinRouter);

  // Обработчик ошибок
  app.use((err, req, res, _next) => {
    console.error('API Error:', { path: req.path, error: err?.message });
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
