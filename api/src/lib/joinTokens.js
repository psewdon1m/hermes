import crypto from 'node:crypto';
import { redis } from './redis.js';

const {
  JOIN_TOKEN_TTL_SECONDS = '86400',
  JOIN_CODE_MAX_ATTEMPTS = '6',
} = process.env;

const CODE_KEY_PREFIX = 'join:code:';
const DEFAULT_CODE_LENGTH = 16;

function generateCode(len = DEFAULT_CODE_LENGTH) {
  // 12 random bytes -> 16 base64url characters without padding
  return crypto.randomBytes(12).toString('base64url').slice(0, len);
}

function makeRecord(token, meta = {}) {
  return JSON.stringify({
    token,
    callId: meta.callId ?? null,
    role: meta.role ?? null,
    createdAt: Date.now(),
  });
}

export async function allocateJoinCode(token, meta = {}) {
  if (!token || typeof token !== 'string') {
    throw new Error('allocateJoinCode: token must be a non-empty string');
  }

  const ttl = Number(JOIN_TOKEN_TTL_SECONDS) || 86400;
  const maxAttempts = Number(JOIN_CODE_MAX_ATTEMPTS) || 6;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateCode();
    const key = `${CODE_KEY_PREFIX}${code}`;
    const record = makeRecord(token, meta);
    const result = await redis.set(key, record, 'EX', ttl, 'NX');
    if (result === 'OK') {
      return code;
    }
  }

  throw new Error('allocateJoinCode: failed to allocate unique join code');
}

export async function resolveJoinCode(code) {
  if (!code || typeof code !== 'string') {
    return null;
  }
  const key = `${CODE_KEY_PREFIX}${code}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.token) {
      return null;
    }
    return {
      token: parsed.token,
      callId: parsed.callId ?? null,
      role: parsed.role ?? null,
      createdAt: parsed.createdAt ?? null,
    };
  } catch {
    return null;
  }
}

export async function refreshJoinCodeTTL(code) {
  if (!code || typeof code !== 'string') return false;
  const ttl = Number(JOIN_TOKEN_TTL_SECONDS) || 86400;
  const key = `${CODE_KEY_PREFIX}${code}`;
  const exists = await redis.expire(key, ttl);
  return exists === 1;
}
