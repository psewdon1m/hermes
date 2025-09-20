import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getCallInfo } from '../services/calls.js';
import { createTurnCredentials } from '../services/turn.js';

const router = express.Router();

// Схема валидации для присоединения к звонку
const joinCallSchema = z.object({
  token: z.string().min(1)
});

// Присоединение к звонку
router.post('/join', async (req, res) => {
  try {
    const { token } = joinCallSchema.parse(req.body);
    
    // Проверяем JWT токен
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    } catch (jwtError) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    const { callId, role } = decoded;
    
    // Проверяем, существует ли звонок
    const callInfo = await getCallInfo(callId);
    if (!callInfo) {
      return res.status(404).json({ error: 'call_not_found' });
    }

    // Создаем TURN credentials
    const turnCredentials = await createTurnCredentials(callId);

    const response = {
      callId,
      role: role || 'participant',
      turnCredentials,
      status: 'joined'
    };

    res.json(response);
  } catch (error) {
    console.error('Join call error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'invalid_request', details: error.errors });
    }
    res.status(500).json({ error: 'internal_error' });
  }
});

export { router as joinRouter };
