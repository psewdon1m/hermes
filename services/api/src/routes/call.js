import express from 'express';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { createCall, getCallInfo } from '../services/calls.js';
import { createTurnCredentials } from '../services/turn.js';

const router = express.Router();

// Схема валидации для создания звонка
const createCallSchema = z.object({
  initiator_telegram_id: z.string().min(1).max(100)
});

// Создание нового звонка
router.post('/create', async (req, res) => {
  try {
    const { initiator_telegram_id } = createCallSchema.parse(req.body);
    
    const callId = nanoid(12);
    const domain = process.env.DOMAIN || 'tgcall.us';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    
    // Создаем звонок в Redis
    await createCall(callId, {
      initiator_telegram_id,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    // Создаем JWT токен для присоединения
    const joinToken = jwt.sign(
      { 
        callId, 
        role: 'initiator',
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 часа
      },
      process.env.JWT_SECRET || 'default-secret'
    );

    // Создаем TURN credentials
    const turnCredentials = await createTurnCredentials(callId);

    const response = {
      callId,
      joinUrl: `${protocol}://${domain}/call?token=${joinToken}`,
      turnCredentials,
      status: 'created'
    };

    res.json(response);
  } catch (error) {
    console.error('Create call error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'invalid_request', details: error.errors });
    }
    res.status(500).json({ error: 'internal_error' });
  }
});

// Получение информации о звонке
router.get('/info/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const callInfo = await getCallInfo(callId);
    
    if (!callInfo) {
      return res.status(404).json({ error: 'call_not_found' });
    }

    res.json(callInfo);
  } catch (error) {
    console.error('Get call info error:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

export { router as callRouter };
