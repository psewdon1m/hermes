/ services/api/src/services/calls.js
import crypto from 'crypto';
import { customAlphabet } from 'nanoid';
import { redis } from '../lib/redis.js';

const alphabet = 'ABCDEFGHJKL MNOPRSTUVWXYZ23456789'.replace(/\s+/g, '');
const nanoid = customAlphabet(alphabet, 6); // 6-символьный OTC

// --- TTLы, можно переопределить через ENV
const {
  CALL_TTL_PENDING = '3600',   // 1ч
  CALL_TTL_ACTIVE  = '21600',  // 6ч
  CALL_TTL_ENDED   = '300',    // 5м
} = process.env;

const TTL_PENDING = parseInt(CALL_TTL_PENDING, 10);
const TTL_ACTIVE  = parseInt(CALL_TTL_ACTIVE, 10);
const TTL_ENDED   = parseInt(CALL_TTL_ENDED, 10);

// --- утилиты
export function genCallId() {
  return 'c_' + crypto.randomBytes(8).toString('hex');
}

async function ensureExpireBoth(callId, ttl) {
  await redis.multi()
    .expire(`call:${callId}`, ttl)
    .expire(`call:${callId}:peers`, ttl)
    .exec();
}

export async function setStatus(callId, status) {
  const now = Date.now();
  const ttl = status === 'active' ? TTL_ACTIVE
            : status === 'ended'  ? TTL_ENDED
            : TTL_PENDING;

  await redis.multi()
    .hset(`call:${callId}`, 'status', status, 'updatedAt', String(now))
    .expire(`call:${callId}`, ttl)
    .expire(`call:${callId}:peers`, ttl)
    .exec();
}

export async function touchActive(callId) {
    await ensureExpireBoth(callId, TTL_ACTIVE);
    await redis.hset(`call:${callId}`, 'updatedAt', String(Date.now()));
  }
  
  export async function touchPending(callId) {
    await ensureExpireBoth(callId, TTL_PENDING);
    await redis.hset(`call:${callId}`, 'updatedAt', String(Date.now()));
  }
  
  export async function touchEnded(callId) {
    await ensureExpireBoth(callId, TTL_ENDED);
    await redis.hset(`call:${callId}`, 'updatedAt', String(Date.now()));
  }

// --- публичные операции

export async function createCall(initiator) {
    const callId = genCallId();
    const code = nanoid();
  
    const now = Date.now();
    await redis.multi()
      .hset(`call:${callId}`, 'status', 'pending', 'createdAt', String(now), 'updatedAt', String(now), 'initiator', in>    .expire(`call:${callId}`, TTL_PENDING)
      .del(`call:${callId}:peers`)  // на всякий
      .expire(`call:${callId}:peers`, TTL_PENDING)
      .set(`otc:${code}`, callId, 'EX', 900) // 15 мин OTC
      .exec();
  
    return { callId, code };
  }
  
  export async function resolveCodeToCallId(code) {
    const key = `otc:${code}`;
    const callId = await redis.get(key);
    if (callId) await redis.del(key); // одноразовость
    return callId;
  }
  
  export async function callExists(callId) {
    return Boolean(await redis.exists(`call:${callId}`));
  }
  
  export async function peersCount(callId) {
    return await redis.scard(`call:${callId}:peers`);
  }
  
  export async function addPeer(callId, peerId) {
    await redis.sadd(`call:${callId}:peers`, peerId);
  }
  
  export async function removePeer(callId, peerId) {
    await redis.srem(`call:${callId}:peers`, peerId);
  }