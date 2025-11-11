// services/api/src/routes/call.js
import express from 'express';
import * as crypto from 'node:crypto';
import { z } from 'zod';
import { redis } from '../lib/redis.js';
import { badRequest, internal } from '../lib/errors.js';
import { allocateJoinCode } from '../lib/joinTokens.js';

export const callRouter = express.Router();

const {
  API_ORIGIN = 'https://example.com',
  JWT_SECRET,
  JOIN_TOKEN_TTL_SECONDS = '86400', // 24 часа живёт токен присоединения
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

// === Схемы валидации входящих payload ===
const CreateSchema = z.object({
  initiator_telegram_id: z.string().min(1).max(64),
});
const ResolveSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/),
});

// Строим публичную ссылку для присоединения
function buildJoinUrl(code) {
  return `${API_ORIGIN.replace(/\/+$/, '')}/join?code=${encodeURIComponent(code)}`;
}

// POST /api/call/create -> { callId, code, joinUrl }
callRouter.post('/create', async (req, res) => {
  try {
    const parse = CreateSchema.safeParse(req.body);
    if (!parse.success) return badRequest(res, parse.error.issues);

    const callId = randomId('c_', 16);
    const code = (Math.random().toString(36).slice(2, 8) + 'XXXX').slice(0, 6).toUpperCase();

    // Сохраняем карточку звонка: статус "pending" + служебные таймстемпы для TTL
    const now = Date.now();
    await redis.hset(`call:${callId}`, {
      status: 'pending',
      createdAt: String(now),
      updatedAt: String(now),
      initiator: parse.data.initiator_telegram_id
    });
    await redis.expire(`call:${callId}`, 60 * 60); // держим запись в Redis 1 час

    // OTC код связывает пользователя, знающего код, с callId (истекает через 15 минут)
    await redis.setex(`otc:${code}`, 15 * 60, callId);

    // Генерируем токен offerer для инициатора (по умолчанию живёт 24 часа)
    const tokenOfferer = jwtSign({ callId, role: 'offerer' }, JWT_SECRET, Number(JOIN_TOKEN_TTL_SECONDS));
    const joinCode = await allocateJoinCode(tokenOfferer, { callId, role: 'offerer' });
    return res.json({
      callId,
      code,
      joinUrl: buildJoinUrl(joinCode),
      joinCode,
      joinToken: tokenOfferer,
    });
  } catch (e) {
    console.error(e);
    return internal(res);
  }
});

// POST /api/call/resolve -> { joinUrl }  (выполняет второй участник после ввода одноразового кода)
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
    const joinCode = await allocateJoinCode(token, { callId, role: 'answerer' });
    return res.json({
      joinUrl: buildJoinUrl(joinCode),
      joinCode,
      joinToken: token,
    });
  } catch (e) {
    console.error(e);
    return internal(res);
  }
});


