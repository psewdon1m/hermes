import express from 'express';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { createCall, getCallInfo } from '../services/calls.js';
import { createTurnCredentials } from '../services/turn.js';

const router = express.Router();

const createCallSchema = z.object({
  initiator_telegram_id: z.string().min(1).max(100)
});

router.post('/create', async (req, res) => {
  try {
    const { initiator_telegram_id } = createCallSchema.parse(req.body);

    const callId = nanoid(12);
    const domain = process.env.DOMAIN || 'tgcall.us';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

    await createCall(callId, {
      initiator_telegram_id,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    const joinToken = jwt.sign(
      {
        callId,
        role: 'initiator',
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60
      },
      process.env.JWT_SECRET || 'default-secret'
    );

    const turnCredentials = await createTurnCredentials(callId);

    res.json({
      callId,
      joinUrl: ${protocol}:///call?token=,
      turnCredentials,
      status: 'created'
    });
  } catch (error) {
    console.error('Create call error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'invalid_request', details: error.errors });
    }
    res.status(500).json({ error: 'internal_error' });
  }
});

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
