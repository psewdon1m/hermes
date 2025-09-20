import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Создание нового звонка
export async function createCall(callId, callData) {
  const key = `call:${callId}`;
  const data = {
    ...callData,
    id: callId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Сохраняем звонок с TTL 1 час (3600 секунд)
  await redis.hset(key, data);
  await redis.expire(key, 3600);
  
  return data;
}

// Получение информации о звонке
export async function getCallInfo(callId) {
  const key = `call:${callId}`;
  const data = await redis.hgetall(key);
  
  if (!data || Object.keys(data).length === 0) {
    return null;
  }
  
  return data;
}

// Обновление статуса звонка
export async function updateCallStatus(callId, status) {
  const key = `call:${callId}`;
  await redis.hset(key, { 
    status, 
    updatedAt: new Date().toISOString() 
  });
  
  // Если звонок активен, убираем TTL
  if (status === 'active') {
    await redis.persist(key);
  } else {
    // Если неактивен, ставим TTL 1 час
    await redis.expire(key, 3600);
  }
}

// Удаление звонка
export async function deleteCall(callId) {
  const key = `call:${callId}`;
  await redis.del(key);
}
