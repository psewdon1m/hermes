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
  JOIN_TOKEN_TTL_SECONDS = '86400', // 24h Ð¿Ð¾ ÑƒÐ¼Ð¾Ð»Ñ‡Ð°Ð½Ð¸ÑŽ
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

// === ÑÑ…ÐµÐ¼Ñ‹ Ð²Ð°Ð»Ð¸Ð´Ð°Ñ†Ð¸Ð¸ ===
const CreateSchema = z.object({
    initiator_telegram_id: z.string().min(1).max(64),
  });
  const ResolveSchema = z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/),
  });
  
  // Ð¥ÐµÐ»Ð¿ÐµÑ€ Ð´Ð»Ñ ÑÑÑ‹Ð»Ð¾Ðº
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
  
      // Ð˜Ð½Ð¸Ñ†Ð¸Ð°Ð»Ð¸Ð·Ð¸Ñ€ÑƒÐµÐ¼ ÑÐ¾ÑÑ‚Ð¾ÑÐ½Ð¸Ðµ Ð·Ð²Ð¾Ð½ÐºÐ°: "pending" Ð¸ Ñ‡Ð°ÑÐ¾Ð²Ð¾Ð¹ TTL Ð±ÐµÐ· Ð°ÐºÑ‚Ð¸Ð²Ð½Ð¾ÑÑ‚Ð¸
      const now = Date.now();
      await redis.hset(`call:${callId}`, {
        status: 'pending',
        createdAt: String(now),
        updatedAt: String(now),
        initiator: parse.data.initiator_telegram_id
      });
      await redis.expire(`call:${callId}`, 60 * 60); // 1 Ñ‡Ð°Ñ Ð±ÐµÐ· Ð°ÐºÑ‚Ð¸Ð²Ð½Ð¾ÑÑ‚Ð¸
  
      // OTC Ð´Ð»Ñ Â«Ñ€ÐµÐ·Ð¾Ð»Ð²Ð°Â» Ð²Ñ‚Ð¾Ñ€Ð¾Ð¹ ÑÑÑ‹Ð»ÐºÐ¾Ð¹ (ÐµÑÐ»Ð¸ Ð½ÑƒÐ¶Ð½Ð¾), Ð½Ð¾ Ð¼Ñ‹ Ð¶Ð¸Ð²Ñ‘Ð¼ Ð¿Ð¾ Ð¾Ð´Ð½Ð¾Ð¹ ÑÑÑ‹Ð»ÐºÐµ
      await redis.setex(`otc:${code}`, 15 * 60, callId);
  
      // Ð“ÐµÐ½ÐµÑ€Ð¸Ð¼ Â«Ð´Ð»Ð¸Ð½Ð½Ñ‹Ð¹Â» Ñ‚Ð¾ÐºÐµÐ½ (Ð¿Ð¾ ÑƒÐ¼Ð¾Ð»Ñ‡Ð°Ð½Ð¸ÑŽ 24 Ñ‡Ð°ÑÐ°)
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

  // POST /api/call/resolve -> { joinUrl }  (Ð¾Ð¿Ñ†Ð¸Ð¾Ð½Ð°Ð»ÑŒÐ½Ð¾, ÐµÑÐ»Ð¸ Ð¿Ð¾Ð»ÑŒÐ·ÑƒÐµÑˆÑŒÑÑ ÐºÐ¾Ð´Ð¾Ð¼)
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
