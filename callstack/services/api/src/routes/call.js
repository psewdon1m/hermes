// services/api/src/routes/call.js
import express from 'express';
import * as crypto from 'node:crypto';
import { z } from 'zod';
import { redis } from '../lib/redis.js';
import { badRequest, internal } from '../lib/errors.js';

export const callRouter = express.Router();

const {
  API_ORIGIN = 'https://call.tgcall.space',
  JWT_SECRET,
  JOIN_TOKEN_TTL_SECONDS = '86400', // 24h по умолчанию
} = process.env;

if (!JWT_SECRET) throw new Error('JWT_SECRET is required');

function nowSeconds() { return Math.floor(Date.now() / 1000); }
function randomId(prefix = '', len = 10) {
  return prefix + crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}
function jwtSign(payload, secret, expSec) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, exp: nowSeconds() + Number(expSec) };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(body)}`;
  const sig = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${sig}`;
}

// === схемы валидации ===
const CreateSchema = z.object({
  initiator_telegram_id: z.string().min(1).max(64),
});
const ResolveSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/),
});

// Хелпер для ссылок
function buildJoinUrl(token) {
  return `${API_ORIGIN.replace(/\/+$/, '')}/join?token=${encodeURIComponent(token)}`;
}

// POST /api/call/create -> { callId, code, joinUrl }
callRouter.post('/create', async (req, res) => {
  try {
    const parse = CreateSchema.safeParse(req.body);
    if (!parse.success) return badRequest(res, parse.error.issues);

    const callId = randomId('c_', 16);
    const code = (Math.random().toString(36).slice(2, 8) + 'XXXX').slice(0, 6).toUpperCase();

    // Инициализируем состояние звонка: "pending" и часовой TTL без активности
    const now = Date.now();
    await redis.hset(`call:${callId}`, {
      status: 'pending',
      createdAt: String(now),
      updatedAt: String(now),
      initiator: parse.data.initiator_telegram_id
    });
    await redis.expire(`call:${callId}`, 60 * 60); // 1 час без активности

    // OTC для «резолва» второй ссылкой (если нужно), но мы живём по одной ссылке
    await redis.setex(`otc:${code}`, 15 * 60, callId);

    // Генерим «длинный» токен (по умолчанию 24 часа)
    const tokenOfferer = jwtSign({ callId, role: 'offerer' }, JWT_SECRET, Number(JOIN_TOKEN_TTL_SECONDS));
    return res.json({
      callId,
      code,
      joinUrl: buildJoinUrl(tokenOfferer),
    });
  } catch (e) {
    console.error(e);
    return internal(res);
  }
});

// POST /api/call/resolve -> { joinUrl }  (опционально, если пользуешься кодом)
callRouter.post('/resolve', async (req, res) => {
  try {
    const parse = ResolveSchema.safeParse(req.body);
    if (!parse.success) return badRequest(res, parse.error.issues);
    const code = parse.data.code.toUpperCase();

    const key = `otc:${code}`;
    const callId = await redis.get(key);
    if (!callId) return res.status(404).json({ error: 'code_not_found_or_expired' });

    await redis.del(key);

    const token = jwtSign({ callId, role: 'answerer' }, JWT_SECRET, Number(JOIN_TOKEN_TTL_SECONDS));
    return res.json({ joinUrl: buildJoinUrl(token) });
  } catch (e) {
    console.error(e);
    return internal(res);
  }
});
