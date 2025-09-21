import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getCallInfo } from '../services/calls.js';
import { createTurnCredentials } from '../services/turn.js';

const router = express.Router();

const joinCallSchema = z.object({
  token: z.string().min(1)
});

async function joinCallHandler(req, res) {
  try {
    const { token } = joinCallSchema.parse(req.body);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    } catch {
      return res.status(401).json({ error: 'invalid_token' });
    }

    const { callId, role } = decoded;
    const callInfo = await getCallInfo(callId);
    if (!callInfo) {
      return res.status(404).json({ error: 'call_not_found' });
    }

    const turnCredentials = await createTurnCredentials(callId);

    res.json({
      callId,
      role: role || 'participant',
      turnCredentials,
      status: 'joined'
    });
  } catch (error) {
    console.error('Join call error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'invalid_request', details: error.errors });
    }
    res.status(500).json({ error: 'internal_error' });
  }
}

router.post('/', joinCallHandler);
router.post('/join', joinCallHandler);

export { router as joinRouter };
