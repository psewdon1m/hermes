import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { callRouter } from './routes/call.js';
import { joinRouter } from './routes/join.js';

export function createApp() {
  const app = express();

  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    process.env.DOMAIN ? https:// : 'https://tgcall.us'
  ];

  app.use(cors({
    origin: allowedOrigins,
    credentials: false
  }));

  app.use(express.json({ limit: '100kb' }));
  app.use(morgan('tiny'));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/call', callRouter);
  app.use('/api/join', joinRouter);

  app.use((err, req, res, _next) => {
    console.error('API Error:', { path: req.path, error: err?.message });
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
