import express from 'express';
import * as crypto from 'node:crypto';
import { z } from 'zod';
import { redis } from '../lib/redis.js';

export const joinRouter = express.Router();

const {
  DOMAIN = 'call.tgcall.us',
  WS_PUBLIC = 'wss://call.tgcall.us/ws',
  TURN_DOMAIN = 'call.tgcall.us',
  TURN_SECRET,
} = process.env;

if (!TURN_SECRET) throw new Error('TURN_SECRET is required');

function nowSeconds(){ return Math.floor(Date.now()/1000); }
function hmac(username){ // HMAC(username:timestamp) -> Base64 cred
  return crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');
}

// === JWT verify (проверяем токен, выданный API) ===
function jwtVerify(token, secret){
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('bad_jwt');
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  if (sig !== s) throw new Error('bad_jwt_sig');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  if (!payload || !payload.callId) throw new Error('bad_jwt_payload');
  if (payload.exp && nowSeconds() > payload.exp) throw new Error('jwt_expired');
  return payload;
}

const JoinSchema = z.object({
  token: z.string().min(10),
});

// Формируем список ICE-серверов с приоритетом TLS/TCP на порту 5349
function buildIceServers(){
  const u = Math.floor(Date.now()/1000) + 600; // ttl 10 минут
  const username = `${u}:user`;
  const credential = hmac(username);
  return [
    { urls: [`stun:${TURN_DOMAIN}:3478`] },
    { urls: [`turn:${TURN_DOMAIN}:3478?transport=udp`], username, credential },
    { urls: [`turn:${TURN_DOMAIN}:3478?transport=tcp`], username, credential },
    { urls: [`turns:${TURN_DOMAIN}:5349?transport=tcp`], username, credential },
  ];
}

// POST /api/join { token } -> { callId, role, iceServers, wsUrl }
joinRouter.post('/', async (req, res) => {
  try {
    const parse = JoinSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: 'bad_request', details: parse.error.issues });

    const { token } = parse.data;
    const payload = jwtVerify(token, process.env.JWT_SECRET);
    const callId = payload.callId;

    // Фиксируем роль участника относительно уже подключившихся:
    // первый peer становится offerer, следующие получают роль answerer
    const peersKey = `call:${callId}:peers`;
    const peersCount = await redis.scard(peersKey);
    const role = (peersCount > 0) ? 'answerer' : 'offerer';

    return res.json({
      callId,
      role,
      iceServers: buildIceServers(),
      wsUrl: WS_PUBLIC
    });
  } catch (e) {
    console.error(e);
    const msg = (e && e.message) || 'internal_error';
    if (msg === 'bad_jwt' || msg === 'bad_jwt_sig' || msg === 'jwt_expired' || msg === 'bad_jwt_payload') {
      return res.status(401).json({ error: msg });
    }
    return res.status(500).json({ error: 'internal_error' });
  }
});

