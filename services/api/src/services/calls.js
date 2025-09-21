import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const callTimeoutMinutes = Number(process.env.CALL_TIMEOUT_MINUTES ?? 60);
const defaultCallTtlSeconds = Number.isFinite(callTimeoutMinutes) && callTimeoutMinutes > 0
  ? Math.round(callTimeoutMinutes * 60)
  : 3600;
const inactiveTtlSeconds = Number(process.env.INACTIVE_TTL_SECONDS ?? defaultCallTtlSeconds) || defaultCallTtlSeconds;

export async function createCall(callId, callData) {
  const key = `call:${callId}`;
  const data = {
    ...callData,
    id: callId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await redis.hset(key, data);
  await redis.expire(key, defaultCallTtlSeconds);

  return data;
}

export async function getCallInfo(callId) {
  const key = `call:${callId}`;
  const data = await redis.hgetall(key);

  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  return data;
}

export async function updateCallStatus(callId, status) {
  const key = `call:${callId}`;
  await redis.hset(key, {
    status,
    updatedAt: new Date().toISOString()
  });

  if (status === 'active') {
    await redis.persist(key);
  } else {
    await redis.expire(key, inactiveTtlSeconds);
  }
}

export async function deleteCall(callId) {
  const key = `call:${callId}`;
  await redis.del(key);
}
